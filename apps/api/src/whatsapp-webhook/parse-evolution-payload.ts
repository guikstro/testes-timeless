import { WhatsAppInboundMessageJob } from "../common/queue/whatsapp-event.job";

/**
 * Subconjunto do webhook da Evolution API (v2) que este produto realmente lê.
 * O payload real carrega bem mais campos; o que não está modelado aqui é
 * ignorado, não é erro.
 */
interface RawEvolutionPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    pushName?: string;
    messageTimestamp?: number | string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text?: string };
      // Qualquer outra chave (imageMessage, audioMessage, ...) significa
      // "mensagem não-texto" para este produto.
      [key: string]: unknown;
    };
    /** Presente quando a conversa nasceu de um anúncio Click-to-WhatsApp. */
    contextInfo?: {
      conversionSource?: string;
      ctwaClid?: string;
      externalAdReply?: { sourceId?: string; sourceUrl?: string; title?: string };
    };
  };
}

export interface ParsedEvolutionEvent {
  kind: "message";
  job: WhatsAppInboundMessageJob;
}

export interface ParsedEvolutionConnectionUpdate {
  kind: "connection";
  instanceName: string;
  state: "open" | "connecting" | "close";
}

export type ParsedEvolution = ParsedEvolutionEvent | ParsedEvolutionConnectionUpdate | null;

/**
 * Normaliza um evento da Evolution para exatamente o mesmo job que o webhook
 * da Meta produz, de modo que o pipeline de ingestão (lead → atribuição →
 * qualificação → Conversions API) não saiba qual transporte trouxe a
 * mensagem. Devolve `null` para eventos que este produto não consome.
 */
export function parseEvolutionPayload(payload: unknown): ParsedEvolution {
  const body = payload as RawEvolutionPayload;
  const event = body?.event?.toLowerCase().replace(/_/g, ".");
  const instanceName = body?.instance;
  if (!instanceName) return null;

  if (event === "connection.update") {
    const rawState = (body.data as { state?: string } | undefined)?.state;
    const state = rawState === "open" || rawState === "connecting" ? rawState : "close";
    return { kind: "connection", instanceName, state };
  }

  if (event !== "messages.upsert") return null;

  const data = body.data;
  const key = data?.key;
  // `fromMe` é o eco das mensagens que nós mesmos enviamos. Ignorar aqui é o
  // que impede um lead de ser "criado" por uma mensagem nossa e impede que a
  // própria resposta do atendente dispare os gatilhos de qualificação.
  if (!key?.id || !key.remoteJid || key.fromMe) return null;

  // Grupos (`@g.us`) e status/broadcast não são leads individuais — este
  // produto rastreia conversas 1:1 com um número.
  if (!key.remoteJid.endsWith("@s.whatsapp.net")) return null;

  const waId = key.remoteJid.split("@")[0];
  if (!waId) return null;

  const text = data?.message?.conversation ?? data?.message?.extendedTextMessage?.text;
  const timestampSeconds = Number(data?.messageTimestamp);
  if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) return null;

  const ctwaClid = data?.contextInfo?.ctwaClid;

  return {
    kind: "message",
    job: {
      provider: "EVOLUTION",
      routingKey: instanceName,
      waId,
      profileName: data?.pushName,
      messageId: key.id,
      type: text ? "text" : "other",
      text: text ?? undefined,
      timestampSeconds,
      referral: ctwaClid
        ? {
            ctwaClid,
            sourceId: data?.contextInfo?.externalAdReply?.sourceId,
            sourceUrl: data?.contextInfo?.externalAdReply?.sourceUrl,
            headline: data?.contextInfo?.externalAdReply?.title,
          }
        : undefined,
    },
  };
}
