/** Present only when the message originated from a real Click-to-WhatsApp ad — Meta attaches this itself, no correlation needed. */
export interface InboundMessageReferral {
  ctwaClid?: string;
  sourceId?: string;
  sourceUrl?: string;
  headline?: string;
}

/** Shape of jobs on the `whatsapp-events` queue — shared by the API (producer) and worker (consumer). */
export interface WhatsAppInboundMessageJob {
  phoneNumberId: string;
  /** Customer's phone number as WhatsApp sends it: digits only, country code included, no `+`. */
  waId: string;
  profileName?: string;
  /** Meta's `wamid.*` — the idempotency key for this message. */
  messageId: string;
  type: "text" | "other";
  text?: string;
  timestampSeconds: number;
  referral?: InboundMessageReferral;
}
