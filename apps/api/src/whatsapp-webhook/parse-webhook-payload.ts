import { WhatsAppInboundMessageJob } from "../common/queue/whatsapp-event.job";

/**
 * Minimal typing for the subset of Meta's WhatsApp Cloud API webhook payload
 * we actually read — see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples.
 * The real payload carries many more fields (statuses, media, reactions,
 * etc.); anything we don't model here is ignored, not an error.
 */
interface RawWebhookPayload {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        metadata?: { phone_number_id?: string };
        contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
        messages?: Array<{
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

/**
 * Extracts one inbound-message job per actual message in the payload.
 * Delivery/read receipts (`value.statuses`) and anything without a
 * `messages` array are silently skipped — they're about messages *we* sent,
 * which doesn't apply yet since this product doesn't send WhatsApp messages.
 */
export function parseWebhookPayload(payload: unknown): WhatsAppInboundMessageJob[] {
  const jobs: WhatsAppInboundMessageJob[] = [];
  const body = payload as RawWebhookPayload;

  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      const profileName = value?.contacts?.[0]?.profile?.name;

      for (const message of value?.messages ?? []) {
        if (!message.id || !message.from || !message.timestamp) continue;

        jobs.push({
          phoneNumberId,
          waId: message.from,
          profileName,
          messageId: message.id,
          type: message.type === "text" ? "text" : "other",
          text: message.type === "text" ? message.text?.body : undefined,
          timestampSeconds: Number(message.timestamp),
        });
      }
    }
  }

  return jobs;
}
