import { MetaApiError } from "./meta-api-error";
import { MetaInsightDaPagina } from "./meta-graph-types";

/**
 * Os Insights da Página do Facebook: o que pedir à Meta e como guardar.
 *
 * Os nomes são os de depois de junho de 2026, quando a Meta aposentou boa
 * parte das métricas antigas da Página (impressões e alcance viraram
 * visualizações e visualizadores). Pedir um nome aposentado derruba a chamada
 * inteira, então a lista fica aqui, num lugar só.
 */
export const METRICAS_DIARIAS = [
  /** Visualizações: quantas vezes o conteúdo da Página foi exibido. */
  "page_media_view",
  /** Visitas ao perfil da Página. */
  "page_views_total",
  /** Interações com os posts. */
  "page_post_engagements",
  /** Novos seguidores no dia. */
  "page_daily_follows_unique",
  /** Quem deixou de seguir no dia. */
  "page_daily_unfollows_unique",
  /** Vídeos assistidos por pelo menos 3 segundos. */
  "page_video_views",
  /** Tempo total de vídeo assistido, em milissegundos. */
  "page_video_view_time",
  /** Total de seguidores da Página naquele dia. */
  "page_follows",
] as const;

/**
 * Visualizadores únicos. Não podem ser somados dia a dia (a mesma pessoa
 * contaria várias vezes), e a Meta não dá o total de um período qualquer:
 * só de 7 e de 28 dias. Por isso são guardados com o período no nome.
 */
export const VISUALIZADORES = "page_total_media_view_unique";
export const PERIODOS_DOS_VISUALIZADORES = ["week", "days_28"] as const;

/** O teto da Meta para uma chamada de Insights (90 dias), menos um de folga. */
export const DIAS_DO_HISTORICO = 89;

export interface LinhaDaPagina {
  metrica: string;
  /** Dia civil, AAAA-MM-DD. */
  dia: string;
  valor: number;
}

/**
 * O dia a que um valor diário se refere.
 *
 * A Meta marca cada valor com o fim do período, no fuso da Página: o número
 * do dia 1º chega com `end_time` na meia-noite do dia 2, que em UTC cai às
 * 3h para uma Página em Brasília e às 7h para uma na Califórnia. Voltar 12
 * horas cai no meio do dia certo em qualquer fuso das Américas e da Europa,
 * sem precisar saber qual é o da Página.
 */
export function diaDoValor(fimDoPeriodo: string): string | null {
  const instante = Date.parse(fimDoPeriodo);
  if (Number.isNaN(instante)) return null;
  return new Date(instante - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A resposta da Meta em linhas para guardar.
 *
 * Valor que não é número (algumas métricas devolvem um objeto quebrado por
 * categoria) fica de fora: guardar só o que a tela sabe ler.
 */
export function linhasDosInsights(resposta: MetaInsightDaPagina[], sufixo?: string): LinhaDaPagina[] {
  const linhas: LinhaDaPagina[] = [];
  for (const metrica of resposta) {
    for (const valor of metrica.values ?? []) {
      if (typeof valor.value !== "number" || !Number.isFinite(valor.value) || !valor.end_time) continue;
      const dia = diaDoValor(valor.end_time);
      if (!dia) continue;
      linhas.push({ metrica: sufixo ? `${metrica.name}:${sufixo}` : metrica.name, dia, valor: valor.value });
    }
  }
  return linhas;
}

/**
 * O erro da leitura da Página em português, dizendo o que fazer.
 *
 * Os erros da Página têm causas próprias: a Página fora dos ativos do
 * usuário do sistema, ou o token gerado sem as permissões da Página. A
 * mensagem crua da Meta vai junto, entre parênteses, para o suporte achar.
 */
export function explicaErroDaPagina(erro: MetaApiError | Error): string {
  if (!(erro instanceof MetaApiError)) return erro.message;
  const crua = erro.message;
  const texto = (() => {
    if (erro.isRateLimited) {
      return "A Meta limitou as leituras da Página por alguns minutos. O sistema tenta de novo sozinho na próxima hora.";
    }
    if (erro.code === 190) {
      return "O token não vale mais. Gere um novo no usuário do sistema e conecte de novo em Meta Ads.";
    }
    if (erro.code === 100 && (erro.subcode === 33 || /does not exist|cannot be loaded/i.test(crua))) {
      return "A Meta não encontrou a Página com esse id, ou o usuário do sistema não a enxerga. Confira o id e se a Página está entre os ativos dele.";
    }
    if (erro.code === 10 || (erro.code !== undefined && erro.code >= 200 && erro.code < 300)) {
      return "O token não tem permissão para ler os Insights da Página. Gere um token novo com pages_show_list, pages_read_engagement e read_insights, com a Página entre os ativos do usuário do sistema.";
    }
    return null;
  })();
  return texto ? `${texto} (Meta: ${crua})` : crua;
}

/** Erro da própria leitura da Página, que não veio da Meta como erro. */
export class ErroDaPagina extends Error {}
