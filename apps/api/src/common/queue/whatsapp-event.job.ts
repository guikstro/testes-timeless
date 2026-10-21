export type MediaKind = "audio" | "image" | "video" | "sticker" | "document" | "location" | "contact";

/** Como a mídia aparece na conversa, já que o conteúdo em si não é guardado. */
export const ROTULO_DA_MIDIA: Record<MediaKind, string> = {
  audio: "Áudio",
  image: "Foto",
  video: "Vídeo",
  sticker: "Figurinha",
  document: "Documento",
  location: "Localização",
  contact: "Contato",
};

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
  /** Customer's phone number as WhatsApp sends it: digits only, country code included, no `+`. Vazio quando só o `lid` é conhecido. */
  waId: string;
  profileName?: string;
  /** O id da mensagem no provider (`wamid.*` na Meta, `3EB0...` na Evolution) — chave de idempotência. */
  messageId: string;
  type: "text" | "other";
  /** Texto da mensagem, ou a legenda quando ela é uma mídia. */
  text?: string;
  /** Presente quando a mensagem é áudio, foto etc. (`type` é "other"). */
  mediaKind?: MediaKind;
  timestampSeconds: number;
  referral?: InboundMessageReferral;
  /**
   * Verdadeiro quando a mensagem foi enviada pela própria empresa em outro
   * aparelho (celular, WhatsApp Web), e não pelo sistema. Ausente = mensagem
   * do lead. Nesse caso `waId` é o contato com quem a empresa falou e
   * `profileName` nunca vem preenchido (o nome do remetente seria o nosso).
   */
  fromMe?: boolean;
  /** Identificador LID do contato (só os dígitos), quando o WhatsApp o usa em vez do telefone. */
  lid?: string;
  /** Veio do histórico pedido ao celular: só completa conversas que já existem, sem avisos. */
  historico?: boolean;
}
