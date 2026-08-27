/** Present only when the message originated from a real Click-to-WhatsApp ad — Meta attaches this itself, no correlation needed. */
export interface InboundMessageReferral {
  ctwaClid?: string;
  sourceId?: string;
  sourceUrl?: string;
  headline?: string;
}

/**
 * Shape of jobs on the `whatsapp-events` queue — shared by the API (producer)
 * and worker (consumer).
 *
 * Fase 8: o job é agnóstico de provider. Em vez de carregar o
 * `phone_number_id` da Meta (que só existe na Cloud API), carrega a chave de
 * roteamento junto do provider que a interpreta — assim os dois transportes
 * alimentam exatamente o mesmo pipeline de ingestão a jusante.
 */
export interface WhatsAppInboundMessageJob {
  provider: "CLOUD_API" | "EVOLUTION";
  /** CLOUD_API: `value.metadata.phone_number_id`. EVOLUTION: o `instance` do webhook. */
  routingKey: string;
  /** Customer's phone number as WhatsApp sends it: digits only, country code included, no `+`. */
  waId: string;
  profileName?: string;
  /** O id da mensagem no provider (`wamid.*` na Meta, `3EB0...` na Evolution) — chave de idempotência. */
  messageId: string;
  type: "text" | "other";
  text?: string;
  timestampSeconds: number;
  referral?: InboundMessageReferral;
}
