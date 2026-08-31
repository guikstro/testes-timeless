import { MessageDirection, OutboundStatus } from "@prisma/client";

/**
 * Métricas de atendimento de um lead.
 *
 * Vive fora do service porque é lógica pura sobre datas — testável sem banco,
 * e reaproveitável por qualquer tela que precise dos mesmos números.
 *
 * Todo campo temporal é `number | null` em segundos, nunca `0` como "não
 * aconteceu": zero segundos é um valor legítimo (resposta instantânea) e
 * confundir os dois faria a tela mentir. Null significa "não dá para saber".
 */
export interface LeadMetrics {
  /** Do primeiro contato do lead até a primeira resposta que de fato chegou nele. */
  firstResponseSeconds: number | null;
  /** Do clique no anúncio até o lead mandar a primeira mensagem. */
  clickToContactSeconds: number | null;
  timeToQualifiedSeconds: number | null;
  timeToWonSeconds: number | null;
  inboundCount: number;
  outboundCount: number;
  /** A última mensagem é do lead, ou seja: a bola está com a equipe. */
  awaitingReply: boolean;
  lastMessageAt: Date | null;
  lastMessageDirection: MessageDirection | null;
}

/** Só o que o cálculo usa — assim o módulo não depende do shape do Prisma. */
export interface MetricsMessage {
  direction: MessageDirection;
  timestamp: Date;
  outboundStatus: OutboundStatus | null;
}

export interface MetricsLead {
  firstContactAt: Date;
  qualifiedAt: Date | null;
  wonAt: Date | null;
}

/**
 * Um intervalo negativo não é um tempo de resposta: o `timestamp` das
 * mensagens vem do relógio do WhatsApp, não do nosso, então uma diferença
 * de alguns segundos entre as duas fontes pode inverter a ordem aparente
 * de dois eventos próximos. Preferimos não informar a informar errado.
 */
function secondsBetween(from: Date, to: Date): number | null {
  const seconds = Math.round((to.getTime() - from.getTime()) / 1000);
  return seconds >= 0 ? seconds : null;
}

/**
 * Uma OUTBOUND só conta como resposta se chegou ao lead:
 *
 * - `FAILED` nunca saiu — tratá-la como resposta esconderia justamente o
 *   caso em que o cliente ficou sem atendimento.
 * - `PENDING` ainda não saiu.
 * - `null` é uma OUTBOUND que não passou pela fila de envio. Hoje isso não
 *   acontece: o parser descarta as mensagens `fromMe` do webhook, então toda
 *   OUTBOUND nasce em `sendMessage` já com status. Se um dia essas mensagens
 *   forem ingeridas, elas são respostas reais e precisam contar — não contá-las
 *   puniria quem atende pelo celular.
 */
function reachedTheLead(message: MetricsMessage): boolean {
  return message.outboundStatus === null || message.outboundStatus === "SENT";
}

/** `messages` precisa vir ordenada por timestamp crescente. */
export function computeLeadMetrics(
  lead: MetricsLead,
  messages: MetricsMessage[],
  clickedAt: Date | null,
): LeadMetrics {
  const inbound = messages.filter((message) => message.direction === "INBOUND");
  const outbound = messages.filter((message) => message.direction === "OUTBOUND");

  const firstInbound = inbound[0] ?? null;
  const firstResponse = firstInbound
    ? (outbound.find(
        (message) => reachedTheLead(message) && message.timestamp.getTime() >= firstInbound.timestamp.getTime(),
      ) ?? null)
    : null;

  const lastMessage = messages[messages.length - 1] ?? null;

  return {
    firstResponseSeconds:
      firstInbound && firstResponse ? secondsBetween(firstInbound.timestamp, firstResponse.timestamp) : null,
    clickToContactSeconds:
      clickedAt && firstInbound ? secondsBetween(clickedAt, firstInbound.timestamp) : null,
    timeToQualifiedSeconds: lead.qualifiedAt ? secondsBetween(lead.firstContactAt, lead.qualifiedAt) : null,
    timeToWonSeconds: lead.wonAt ? secondsBetween(lead.firstContactAt, lead.wonAt) : null,
    inboundCount: inbound.length,
    outboundCount: outbound.length,
    awaitingReply: lastMessage?.direction === "INBOUND",
    lastMessageAt: lastMessage?.timestamp ?? null,
    lastMessageDirection: lastMessage?.direction ?? null,
  };
}
