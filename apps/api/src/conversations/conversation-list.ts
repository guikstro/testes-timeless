/**
 * A lista da caixa de entrada, montada a partir das linhas do banco.
 *
 * Fica separada do serviço para que a regra de "o que está pendente" possa ser
 * verificada sem banco nenhum. Ela é o coração da tela: erra aqui e o operador
 * responde a conversa errada, ou pior, deixa de responder a certa.
 */

export type EstagioDoLead = "NEW" | "QUALIFIED" | "MEETING_SCHEDULED" | "WON";

export interface MensagemBruta {
  direction: "INBOUND" | "OUTBOUND";
  type: "TEXT" | "OTHER";
  text: string | null;
  timestamp: Date;
}

export interface ConversaBruta {
  id: string;
  lastMessageAt: Date;
  lead: {
    id: string;
    name: string | null;
    normalizedPhone: string;
    rawPhone: string;
    status: EstagioDoLead;
    disqualifiedAt: Date | null;
  };
  /** As mais recentes primeiro, que é como a contagem de pendentes é feita. */
  messages: MensagemBruta[];
}

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

/**
 * Quantas mensagens do lead estão sem resposta.
 *
 * Conta de trás para frente até esbarrar numa mensagem nossa. É a definição
 * pragmática de "não lida" sem coluna nova no banco: se respondemos depois,
 * lemos; se não, não.
 */
export function pendentes(mensagens: MensagemBruta[]): MensagemBruta[] {
  const acumuladas: MensagemBruta[] = [];
  for (const mensagem of mensagens) {
    if (mensagem.direction === "OUTBOUND") break;
    acumuladas.push(mensagem);
  }
  return acumuladas;
}

/** Texto curto para a prévia, sem quebras de linha atravessando a lista. */
function previa(mensagem: MensagemBruta | undefined): string | null {
  if (!mensagem) return null;
  if (mensagem.type !== "TEXT" || !mensagem.text) return "Mensagem não textual";
  return mensagem.text.replace(/\s+/g, " ").trim() || null;
}

export function montaLista(
  conversas: ConversaBruta[],
  agora: Date,
  filtro: FiltroDaCaixa = "all",
): ItemDaLista[] {
  const itens = conversas.map((conversa): ItemDaLista => {
    const ultima = conversa.messages[0];
    const semResposta = pendentes(conversa.messages);
    const maisAntigaPendente = semResposta[semResposta.length - 1];

    return {
      id: conversa.id,
      lead: {
        id: conversa.lead.id,
        name: conversa.lead.name,
        normalizedPhone: conversa.lead.normalizedPhone,
        status: conversa.lead.status,
        disqualifiedAt: conversa.lead.disqualifiedAt?.toISOString() ?? null,
      },
      lastMessage: ultima
        ? { direction: ultima.direction, text: previa(ultima), timestamp: ultima.timestamp.toISOString() }
        : null,
      unreadCount: semResposta.length,
      awaitingReply: semResposta.length > 0,
      // Conta desde a primeira que ficou sem resposta, não desde a última: se
      // o lead mandou três mensagens em uma hora, ele espera há uma hora.
      esperandoHaSegundos: maisAntigaPendente
        ? Math.max(0, Math.round((agora.getTime() - maisAntigaPendente.timestamp.getTime()) / 1000))
        : null,
    };
  });

  if (filtro === "unread") return itens.filter((item) => item.unreadCount > 0);
  if (filtro === "awaiting") {
    return itens.filter(
      (item) => item.esperandoHaSegundos !== null && item.esperandoHaSegundos >= ATRASO_SEGUNDOS,
    );
  }
  return itens;
}
