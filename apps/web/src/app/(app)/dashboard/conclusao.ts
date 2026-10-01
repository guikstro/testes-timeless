import { formatCentsAsBRL } from "@/lib/currency";
import type { ChaveDaEtapa, EtapaMedida, FunilDoPeriodo, InsightsDaPagina, Overview } from "./tipos";

/**
 * A primeira linha de cada aba, escrita a partir dos números.
 *
 * Antes daqui, o subtítulo era a pergunta que a aba responde: "Quanto entrou,
 * e melhorou?". Uma pergunta na abertura obriga a pessoa a ler a tela inteira
 * para chegar à resposta que ela já poderia ter recebido na primeira linha.
 * O rótulo diz o assunto, e é o título que faz isso; o subtítulo conclui.
 *
 * Duas regras valem para todas as conclusões deste arquivo:
 *
 * 1. **Nada de base inventada.** Sem lead, não existe taxa de qualificação
 *    baixa: existe ausência de medida. A frase muda em vez de exibir zero.
 * 2. **Só se afirma o que o número sustenta.** Uma conclusão que vai além do
 *    dado é pior que nenhuma, porque ela é lida como se tivesse sido medida.
 */

/** A variação em palavras. Null quando não houve período anterior para comparar. */
function comparacao(delta: number | null): string {
  if (delta === null || !Number.isFinite(delta)) return "";
  const porCento = Math.abs(Math.round(delta * 100));
  // Variação abaixo de 1% é ruído de arredondamento, não notícia.
  if (porCento < 1) return ", no mesmo ritmo do período anterior";
  return delta > 0 ? `, ${porCento}% acima do período anterior` : `, ${porCento}% abaixo do período anterior`;
}

function leads(quantos: number): string {
  return `${quantos} ${quantos === 1 ? "lead" : "leads"}`;
}

export function concluiVisaoGeral(overview: Overview): string {
  const { totals, comparacao: comp } = overview;

  if (totals.leads === 0) return "Nenhum lead entrou neste período.";

  const receita =
    totals.revenueCents > 0
      ? ` e ${formatCentsAsBRL(totals.revenueCents)} em vendas atribuídas`
      : totals.won > 0
        ? " e vendas fechadas sem valor registrado"
        : "";

  return `${leads(totals.leads)}${comparacao(comp.leads.delta)}${receita}.`;
}

/** Cada etapa no singular, para "de contatado para qualificado". */
const NA_FRASE: Record<ChaveDaEtapa, string> = {
  leads: "lead",
  contatados: "contatado",
  qualificados: "qualificado",
  reuniao: "reunião",
  vendas: "venda",
};

export interface MaiorPerda {
  de: ChaveDaEtapa;
  para: ChaveDaEtapa;
  /** Quantas pessoas não passaram. */
  perdeu: number;
  /** A mesma perda como fração da etapa de onde elas saíram. */
  proporcao: number;
}

/**
 * Onde o funil perde mais gente, em número de pessoas.
 *
 * Em pessoas, e não em proporção: de uma reunião para nenhuma venda a perda
 * é de 100%, e apontar essa passagem como o problema do mês esconderia os
 * trinta leads que nunca foram respondidos. Empate fica com a etapa de cima,
 * que é onde agir alcança mais gente.
 *
 * Uma função só para o subtítulo e para a frase dentro da aba: com duas
 * contas, a mesma tela chegou a apontar duas passagens diferentes.
 */
export function maiorPerda(etapas: EtapaMedida[]): MaiorPerda | null {
  let pior: MaiorPerda | null = null;
  for (let i = 0; i < etapas.length - 1; i += 1) {
    const perdeu = etapas[i].quantidade - etapas[i + 1].quantidade;
    if (perdeu <= 0 || (pior && perdeu <= pior.perdeu)) continue;
    pior = { de: etapas[i].chave, para: etapas[i + 1].chave, perdeu, proporcao: perdeu / etapas[i].quantidade };
  }
  return pior;
}

export function concluiFunil(dados: FunilDoPeriodo): string {
  const { etapas } = dados.funil;
  const entraram = etapas[0]?.quantidade ?? 0;
  const vendas = etapas[etapas.length - 1]?.quantidade ?? 0;

  if (dados.totalNoPeriodo === 0) return "Nenhum lead entrou neste período.";
  if (entraram === 0) return "Nenhum lead do período tem esta combinação de filtros.";

  /*
    A maior queda do funil, e não o total de cada etapa.

    "48 leads, 20 qualificados, 9 reuniões, 4 vendas" é a tabela lida em voz
    alta: quem lê ainda precisa fazer as subtrações para descobrir onde agir.
    A queda maior é a resposta da pergunta da aba.
  */
  const clientes =
    vendas === 0
      ? `${leads(entraram)} e nenhuma venda fechada`
      : `${leads(entraram)} viraram ${vendas} ${vendas === 1 ? "cliente" : "clientes"}`;

  const pior = maiorPerda(etapas);
  if (!pior) return `${clientes}.`;
  return `${clientes}. A maior perda é de ${NA_FRASE[pior.de]} para ${NA_FRASE[pior.para]}: ${pior.perdeu}.`;
}

export function concluiOrigem(overview: Overview): string {
  const { totals, byOrigin } = overview;

  if (totals.leads === 0) return "Nenhum lead entrou neste período.";

  const identificados = byOrigin.filter((bucket) => bucket.key !== "unknown");
  const comLead = identificados.filter((bucket) => bucket.leads > 0);

  if (comLead.length === 0) {
    return `Nenhum dos ${totals.leads} leads pôde ser ligado a uma origem.`;
  }

  /*
    A melhor origem é a que traz cliente, não a que traz lead.

    É a pergunta da aba, escrita no cabeçalho dela: "o que traz cliente que
    paga?". Ordenar por volume responderia outra coisa, e responderia errado
    com frequência, porque a origem mais barulhenta costuma ser a que menos
    fecha.
  */
  const porReceita = [...comLead].sort((a, b) => b.revenueCents - a.revenueCents || b.won - a.won);
  const melhor = porReceita[0];

  if (melhor.revenueCents === 0 && melhor.won === 0) {
    const porVolume = [...comLead].sort((a, b) => b.leads - a.leads)[0];
    return `${porVolume.label} trouxe mais leads (${porVolume.leads}), e nenhuma origem fechou venda ainda.`;
  }

  const clientes = `${melhor.won} ${melhor.won === 1 ? "cliente" : "clientes"}`;
  const receita = melhor.revenueCents > 0 ? `, ${formatCentsAsBRL(melhor.revenueCents)}` : "";
  return `${melhor.label} é a origem que mais fecha: ${clientes}${receita}.`;
}

export function concluiAtendimento(overview: Overview): string {
  const { atendimento, totals } = overview;

  if (totals.leads === 0) return "Nenhum lead entrou neste período.";

  const esperando =
    atendimento.aguardando > 0
      ? ` ${atendimento.aguardando} ${atendimento.aguardando === 1 ? "ainda espera" : "ainda esperam"} resposta.`
      : "";

  // Sem nenhuma resposta dada, não existe mediana: não é "demorado", é sem medida.
  if (atendimento.medianaPrimeiraRespostaSegundos === null) {
    return atendimento.semResposta > 0
      ? `Nenhum dos ${totals.leads} leads foi respondido ainda.`
      : `Sem resposta registrada no período.${esperando}`;
  }

  return `Metade dos leads é respondida em até ${duracaoCurta(atendimento.medianaPrimeiraRespostaSegundos)}.${esperando}`;
}

/** Duração em palavras curtas, arredondada para a unidade que a pessoa usaria. */
export function duracaoCurta(segundos: number): string {
  if (segundos < 60) return `${Math.round(segundos)} segundos`;

  const minutos = Math.round(segundos / 60);
  if (minutos < 60) return `${minutos} ${minutos === 1 ? "minuto" : "minutos"}`;

  const horas = Math.round(minutos / 60);
  if (horas < 24) return `${horas} ${horas === 1 ? "hora" : "horas"}`;

  const dias = Math.round(horas / 24);
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}

/**
 * A primeira linha da aba Página: o alcance e o saldo de seguidores.
 *
 * As duas perguntas de quem abre os Insights: quanta gente viu, e a Página
 * cresceu ou encolheu. O resto está nos cartões.
 */
export function concluiPagina(dados: InsightsDaPagina | null): string {
  if (!dados) return "Os números da Página não carregaram agora.";
  if (!dados.pagina) return "Escolha a Página do Facebook em Integrações para ver os números dela aqui.";

  const { visualizacoes, seguidoresLiquidos } = dados.atual;
  if (visualizacoes === null) return "A Página ainda não tem números lidos neste período.";

  const vistas = `${visualizacoes.toLocaleString("pt-BR")} ${visualizacoes === 1 ? "visualização" : "visualizações"}`;
  if (seguidoresLiquidos === null) return `${vistas} no período.`;
  if (seguidoresLiquidos === 0) return `${vistas} e o mesmo número de seguidores do começo do período.`;

  const quantos = Math.abs(seguidoresLiquidos).toLocaleString("pt-BR");
  const palavra = Math.abs(seguidoresLiquidos) === 1 ? "seguidor" : "seguidores";
  return `${vistas} e ${quantos} ${palavra} ${seguidoresLiquidos > 0 ? "a mais" : "a menos"}.`;
}
