/**
 * A forma da caixa de entrada e como uma linha do banco vira um item da tela.
 *
 * A regra de "o que está pendente" mora no SQL de `caixa-de-entrada.ts`, e não
 * mais aqui: ela precisa valer antes do corte de duzentas conversas, senão o
 * filtro esconde justamente quem está esperando há mais tempo. O que sobrou
 * neste arquivo é formatação.
 */
import type { LinhaDaCaixa } from "./caixa-de-entrada";

export type EstagioDoLead = "NEW" | "QUALIFIED" | "MEETING_SCHEDULED" | "WON";

export interface ItemDaLista {
  id: string;
  lead: {
    id: string;
    name: string | null;
    normalizedPhone: string;
    status: EstagioDoLead;
    disqualifiedAt: string | null;
  };
  lastMessage: { direction: "INBOUND" | "OUTBOUND"; text: string | null; timestamp: string } | null;
  /** Mensagens do lead depois da nossa última resposta. */
  unreadCount: number;
  awaitingReply: boolean;
  /** Há quantos segundos o lead espera. Null quando não há ninguém esperando. */
  esperandoHaSegundos: number | null;
}

/**
 * A partir de quando uma espera vira atraso.
 *
 * Trinta minutos não é um número redondo escolhido por acaso: é o ponto em que
 * a literatura de vendas mostra a chance de conversão já ter caído de forma
 * acentuada. Na tela é o ponto vermelho.
 */
export const ATRASO_SEGUNDOS = 30 * 60;

export type FiltroDaCaixa = "all" | "unread" | "awaiting";

/** Texto curto para a prévia, sem quebras de linha atravessando a lista. */
function previa(direcao: string | null, tipo: string | null, texto: string | null): string | null {
  if (!direcao) return null;
  if (tipo !== "TEXT" || !texto) return "Mensagem não textual";
  return texto.replace(/\s+/g, " ").trim() || null;
}

/**
 * Traduz a linha que o banco devolveu no item que a tela desenha.
 *
 * Só formatação: a contagem de pendentes, o filtro e a ordem passaram a ser
 * feitos no banco, porque filtrar depois de cortar em duzentas escondia
 * justamente as conversas mais abandonadas. Ver `caixa-de-entrada.ts`.
 */
export function montaItem(linha: LinhaDaCaixa, agora: Date): ItemDaLista {
  return {
    id: linha.id,
    lead: {
      id: linha.leadId,
      name: linha.leadName,
      normalizedPhone: linha.normalizedPhone,
      status: linha.status,
      disqualifiedAt: linha.disqualifiedAt?.toISOString() ?? null,
    },
    lastMessage: linha.ultimaDirecao
      ? {
          direction: linha.ultimaDirecao,
          text: previa(linha.ultimaDirecao, linha.ultimoTipo, linha.ultimoTexto),
          timestamp: (linha.ultimaEm as Date).toISOString(),
        }
      : null,
    unreadCount: linha.naoRespondidas,
    awaitingReply: linha.naoRespondidas > 0,
    // Conta desde a primeira que ficou sem resposta, não desde a última: se o
    // lead mandou três mensagens em uma hora, ele espera há uma hora.
    esperandoHaSegundos: linha.esperaDesde
      ? Math.max(0, Math.round((agora.getTime() - linha.esperaDesde.getTime()) / 1000))
      : null,
  };
}
