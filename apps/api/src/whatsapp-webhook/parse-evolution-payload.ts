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
    key?: { remoteJid?: string; remoteJidAlt?: string; fromMe?: boolean; id?: string };
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
  if (!key?.id || !key.remoteJid) return null;

  // `fromMe` é uma mensagem enviada pela própria empresa. As que saem pelo
  // sistema não chegam aqui (o motor só repassa eventos "notify"), então o que
  // sobra é a resposta dada em outro aparelho. Ela entra como mensagem nossa,
  // sem nunca criar lead nem aproveitar o nome do remetente (seria o nosso).
  const fromMe = key.fromMe === true;

  // Grupos (`@g.us`) e status/broadcast não são leads individuais — este
  // produto rastreia conversas 1:1 com um número. Um contato LID sem o
  // telefone conhecido também não identifica ninguém.
  const jid = key.remoteJid.endsWith("@s.whatsapp.net") ? key.remoteJid : fromMe ? key.remoteJidAlt : undefined;
  if (!jid?.endsWith("@s.whatsapp.net")) return null;

  const waId = jid.split("@")[0]?.split(":")[0];
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
      profileName: fromMe ? undefined : data?.pushName,
      messageId: key.id,
      type: text ? "text" : "other",
      text: text ?? undefined,
      timestampSeconds,
      ...(fromMe ? { fromMe: true } : {}),
      referral: ctwaClid && !fromMe
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
