import { MediaKind, WhatsAppInboundMessageJob } from "../common/queue/whatsapp-event.job";

/**
 * Subconjunto do webhook da Evolution API (v2) que este produto realmente lê.
 * O payload real carrega bem mais campos; o que não está modelado aqui é
 * ignorado, não é erro.
 */
interface RawEvolutionPayload {
  event?: string;
  instance?: string;
  data?: {
    key?: { remoteJid?: string; remoteJidAlt?: string; lid?: string; fromMe?: boolean; id?: string };
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

type Conteudo = Record<string, unknown>;

/** Mensagens que o WhatsApp manda por baixo dos panos e ninguém vê na conversa. */
const SEM_CONTEUDO_VISIVEL = ["reactionMessage", "protocolMessage", "senderKeyDistributionMessage", "pollUpdateMessage"];

const ENVELOPES = ["ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "viewOnceMessageV2Extension", "documentWithCaptionMessage"];

const MIDIAS: [string, MediaKind][] = [
  ["audioMessage", "audio"],
  ["imageMessage", "image"],
  ["videoMessage", "video"],
  ["ptvMessage", "video"],
  ["stickerMessage", "sticker"],
  ["documentMessage", "document"],
  ["locationMessage", "location"],
  ["liveLocationMessage", "location"],
  ["contactMessage", "contact"],
  ["contactsArrayMessage", "contact"],
];

function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() ? valor : undefined;
}

/** Abre os envelopes (mensagem temporária, de visualização única, documento com legenda). */
function desembrulha(mensagem: Conteudo | undefined): Conteudo | undefined {
  let atual = mensagem;
  for (let i = 0; i < 4 && atual; i++) {
    const chave = ENVELOPES.find((nome) => atual && typeof atual[nome] === "object" && atual[nome] !== null);
    if (!chave) break;
    atual = (atual[chave] as { message?: Conteudo }).message;
  }
  return atual;
}

/**
 * O que a mensagem diz. `null` é uma mensagem sem nada para mostrar (reação,
 * protocolo): ela não vira linha na conversa.
 */
function leConteudo(bruta: Conteudo | undefined): { text?: string; mediaKind?: MediaKind } | null {
  const mensagem = desembrulha(bruta);
  if (!mensagem) return {};

  const dito =
    texto(mensagem.conversation) ??
    texto((mensagem.extendedTextMessage as { text?: string } | undefined)?.text) ??
    texto((mensagem.buttonsResponseMessage as { selectedDisplayText?: string } | undefined)?.selectedDisplayText) ??
    texto((mensagem.templateButtonReplyMessage as { selectedDisplayText?: string } | undefined)?.selectedDisplayText) ??
    texto((mensagem.listResponseMessage as { title?: string } | undefined)?.title);
  if (dito) return { text: dito };

  for (const [chave, mediaKind] of MIDIAS) {
    const midia = mensagem[chave] as { caption?: string } | undefined;
    if (midia && typeof midia === "object") return { mediaKind, text: texto(midia.caption) };
  }

  const chaves = Object.keys(mensagem).filter((chave) => chave !== "messageContextInfo");
  if (chaves.length > 0 && chaves.every((chave) => SEM_CONTEUDO_VISIVEL.includes(chave))) return null;
  return {};
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
  // produto rastreia conversas 1:1 com um número.
  const lid = key.lid ?? (key.remoteJid.endsWith("@lid") ? key.remoteJid.split("@")[0] : undefined);
  const jid = key.remoteJid.endsWith("@s.whatsapp.net") ? key.remoteJid : fromMe ? key.remoteJidAlt : undefined;
  const waId = jid?.endsWith("@s.whatsapp.net") ? (jid.split("@")[0]?.split(":")[0] ?? "") : "";

  // Sem telefone, só uma resposta nossa a um contato LID segue adiante: a
  // ingestão a liga ao lead pelo LID que aprendeu quando ele escreveu.
  if (!waId && !(fromMe && lid)) return null;
  if (!key.remoteJid.endsWith("@s.whatsapp.net") && !key.remoteJid.endsWith("@lid")) return null;

  const conteudo = leConteudo(data?.message);
  if (!conteudo) return null;
  const { text, mediaKind } = conteudo;
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
      type: text && !mediaKind ? "text" : "other",
      text: text ?? undefined,
      ...(mediaKind ? { mediaKind } : {}),
      timestampSeconds,
      ...(fromMe ? { fromMe: true } : {}),
      ...(lid ? { lid } : {}),
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
