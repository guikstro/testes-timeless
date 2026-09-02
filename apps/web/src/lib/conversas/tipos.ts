/** O que `GET /conversations` devolve. */

export type EstagioDoLead = "NEW" | "QUALIFIED" | "MEETING_SCHEDULED" | "WON";

export interface ItemDaCaixa {
  id: string;
  lead: {
    id: string;
    name: string | null;
    normalizedPhone: string;
    status: EstagioDoLead;
    disqualifiedAt: string | null;
  };
  lastMessage: { direction: "INBOUND" | "OUTBOUND"; text: string | null; timestamp: string } | null;
  unreadCount: number;
  awaitingReply: boolean;
  /** Há quantos segundos o lead espera resposta. Null quando ninguém espera. */
  esperandoHaSegundos: number | null;
}

export interface Caixa {
  conversations: ItemDaCaixa[];
  total: number;
  /** Verdadeiro quando a lista bateu no teto e há conversas antigas fora dela. */
  truncado: boolean;
}

export type FiltroDaCaixa = "all" | "unread" | "awaiting";

/** Mesmo limite do backend: a partir daqui a espera vira atraso. */
export const ATRASO_SEGUNDOS = 30 * 60;

export const ESTAGIO_ROTULO: Record<EstagioDoLead, string> = {
  NEW: "Novo",
  QUALIFIED: "Qualificado",
  MEETING_SCHEDULED: "Reunião",
  WON: "Cliente",
};

export function nomeDoLead(lead: { name: string | null; normalizedPhone: string }): string {
  return lead.name?.trim() || lead.normalizedPhone;
}

export const ESTAGIO_TOM: Record<EstagioDoLead, "neutral" | "info" | "warning" | "success"> = {
  NEW: "neutral",
  QUALIFIED: "info",
  MEETING_SCHEDULED: "warning",
  WON: "success",
};

export interface MensagemDaFicha {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  type: "TEXT" | "OTHER";
  text: string | null;
  timestamp: string;
  outboundStatus: "PENDING" | "SENT" | "FAILED" | null;
  sendError: string | null;
}

/**
 * A ficha do lead como a caixa de entrada precisa dela.
 *
 * É um recorte do que `GET /leads/:id` devolve, e não a resposta inteira: o
 * painel lateral mostra o essencial, e a ficha completa continua a um clique
 * de distância.
 */
export interface FichaDoLead {
  id: string;
  name: string | null;
  normalizedPhone: string;
  status: EstagioDoLead;
  disqualifiedAt: string | null;
  disqualifiedReason: string | null;
  firstContactAt: string;
  messages: MensagemDaFicha[];
  events: { id: string; type: string; occurredAt: string }[];
  attribution: {
    method: "CTWA_REFERRAL" | "TRACKING_LINK" | "UNKNOWN";
    confidence: "HIGH" | "NONE";
    evidence: Record<string, unknown> | null;
    trackingClick: {
      utmSource: string | null;
      utmCampaign: string | null;
      trackingLink: { name: string } | null;
    } | null;
  } | null;
  adReferences: {
    campaign: { externalId: string; name: string | null } | null;
    ad: { externalId: string; name: string | null } | null;
  };
  metrics: {
    firstResponseSeconds: number | null;
    clickToContactSeconds: number | null;
    inboundCount: number;
    outboundCount: number;
    awaitingReply: boolean;
    lastMessageAt: string | null;
  };
  sale: { amountCents: number | null; classifierType: "AUTOMATIC" | "MANUAL" } | null;
}
