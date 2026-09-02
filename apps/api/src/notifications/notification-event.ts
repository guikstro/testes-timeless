/**
 * O vocabulário do canal em tempo real.
 *
 * Vive num arquivo próprio porque as duas pontas o usam de lados opostos: o
 * worker publica, a API entrega, e eles rodam em processos separados. Uma
 * mudança aqui que só uma das pontas conhecesse produziria eventos que
 * chegam mas ninguém entende.
 */

export type TipoDeNotificacao =
  | "lead.created"
  | "lead.qualified"
  | "lead.won"
  | "lead.stage_changed"
  | "message.received"
  | "message.failed";

export interface NotificationEvent {
  type: TipoDeNotificacao;
  organizationId: string;
  leadId?: string;
  leadName?: string;
  phone?: string;
  stage?: string;
  /** Prévia curta da mensagem, quando o evento tem uma. */
  message?: string;
  title: string;
  body?: string;
  /** ISO 8601, gerado por quem publica. */
  timestamp: string;
}

/**
 * Um canal por organização.
 *
 * O isolamento entre clientes começa aqui, no nome do canal, e não numa
 * comparação feita depois de o evento já ter sido distribuído: assim um erro
 * de filtro na entrega não tem como vazar dado de um cliente para outro,
 * porque o evento do outro nunca chegou naquela assinatura.
 */
export const PREFIXO_DO_CANAL = "notifications:";

export function canalDaOrganizacao(organizationId: string): string {
  return `${PREFIXO_DO_CANAL}${organizationId}`;
}

export function organizacaoDoCanal(canal: string): string | null {
  return canal.startsWith(PREFIXO_DO_CANAL) ? canal.slice(PREFIXO_DO_CANAL.length) : null;
}

/**
 * Como cada estágio do funil se anuncia.
 *
 * Fica aqui, e não em quem produz o evento, porque duas pontas movem lead:
 * o classificador, durante a ingestão, e o operador, arrastando o cartão. Um
 * mapa em cada lugar acabaria com o mesmo estágio anunciado de dois jeitos
 * diferentes conforme o caminho.
 *
 * `NEW` não aparece: o funil não anda para trás, e ninguém precisa ser
 * avisado de que o lead continua onde estava.
 */
export const ANUNCIO_POR_ESTAGIO: Record<
  "QUALIFIED" | "MEETING_SCHEDULED" | "WON",
  { tipo: TipoDeNotificacao; titulo: string }
> = {
  QUALIFIED: { tipo: "lead.qualified", titulo: "Lead qualificado" },
  MEETING_SCHEDULED: { tipo: "lead.stage_changed", titulo: "Reunião marcada" },
  WON: { tipo: "lead.won", titulo: "Venda registrada" },
};
