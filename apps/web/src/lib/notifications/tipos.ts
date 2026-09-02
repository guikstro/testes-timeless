/** O mesmo vocabulário do backend, do lado de cá. */
export type TipoDeNotificacao =
  | "lead.created"
  | "lead.qualified"
  | "lead.won"
  | "lead.stage_changed"
  | "message.received"
  | "message.failed";

/** O que chega pelo cano de tempo real. */
export interface EventoDeNotificacao {
  type: TipoDeNotificacao;
  organizationId: string;
  leadId?: string;
  leadName?: string;
  phone?: string;
  stage?: string;
  message?: string;
  title: string;
  body?: string;
  timestamp: string;
}

/** O que está guardado na caixa, com id e estado de leitura. */
export interface Notificacao {
  id: string;
  type: TipoDeNotificacao;
  title: string;
  body: string | null;
  leadId: string | null;
  read: boolean;
  createdAt: string;
}

export interface PaginaDeNotificacoes {
  notificacoes: Notificacao[];
  proximoCursor: string | null;
  naoLidas: number;
}

export const ROTULO_POR_TIPO: Record<TipoDeNotificacao, string> = {
  "lead.created": "Novo lead",
  "lead.qualified": "Qualificado",
  "lead.won": "Venda",
  "lead.stage_changed": "Mudou de etapa",
  "message.received": "Mensagem",
  "message.failed": "Falha no envio",
};
