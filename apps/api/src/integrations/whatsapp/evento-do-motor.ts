import type { WAMessage } from "baileys";

export type EstadoDaConexao = "open" | "connecting" | "close";

/**
 * O evento do motor no formato que a Evolution entregava por webhook
 * (`{ event, instance, data }`). Manter o formato é o que deixa o
 * `parseEvolutionPayload` e todo o pipeline de ingestão sem mudança.
 */
export interface EventoDoMotor {
  event: "messages.upsert" | "connection.update";
  instance: string;
  data: Record<string, unknown>;
}

export function eventoDeConexao(instanceName: string, state: EstadoDaConexao): EventoDoMotor {
  return { event: "connection.update", instance: instanceName, data: { state } };
}

export function eventoDeMensagem(
  instanceName: string,
  mensagem: WAMessage,
  opcoes: { historico?: boolean } = {},
): EventoDoMotor {
  return {
    event: "messages.upsert",
    instance: instanceName,
    data: {
      ...mensagem,
      ...(opcoes.historico ? { historico: true } : {}),
      // `lid` guarda o identificador original quando o contato é LID: o
      // telefone sai no `remoteJid`, mas a resposta que a equipe dá pelo
      // celular só traz o LID, e é por ele que ela encontra o lead.
      key: {
        ...mensagem.key,
        remoteJid: numeroDeQuemEnviou(mensagem),
        ...(mensagem.key.remoteJid?.endsWith("@lid") ? { lid: mensagem.key.remoteJid.split("@")[0] } : {}),
      },
      messageTimestamp: segundos(mensagem.messageTimestamp),
      // A Evolution trazia a origem do anúncio para o topo; o Baileys a deixa
      // dentro do tipo da mensagem (ex.: `extendedTextMessage.contextInfo`).
      contextInfo: contextoDoAnuncio(mensagem),
    },
  };
}

/**
 * Contatos migrados para LID chegam como `123@lid`, que não é um telefone.
 * O número real vem em `senderPn`, e é por ele que o lead é identificado.
 */
function numeroDeQuemEnviou(mensagem: WAMessage): string | null | undefined {
  const { remoteJid, senderPn } = mensagem.key;
  return remoteJid?.endsWith("@lid") && senderPn ? senderPn : remoteJid;
}

/** Até onde o histórico pedido ao celular é aproveitado. */
export const JANELA_DO_HISTORICO_MS = 30 * 24 * 60 * 60 * 1000;

interface ConversaDoHistorico {
  id: string;
  pnJid?: string | null;
  lidJid?: string | null;
}

/**
 * Traduz as mensagens do histórico para o mesmo formato das mensagens ao
 * vivo. No histórico a conversa costuma vir pelo LID, e é a própria lista de
 * conversas do celular que diz qual telefone está por trás de cada LID.
 */
export function mensagensDoHistorico(
  conversas: ConversaDoHistorico[],
  mensagens: WAMessage[],
  agora: number,
): WAMessage[] {
  const telefoneDoLid = new Map<string, string>();
  const lidDoTelefone = new Map<string, string>();
  for (const conversa of conversas) {
    const lid = conversa.id.endsWith("@lid") ? conversa.id : conversa.lidJid ?? undefined;
    const pn = conversa.id.endsWith("@s.whatsapp.net") ? conversa.id : conversa.pnJid ?? undefined;
    if (lid?.endsWith("@lid") && pn?.endsWith("@s.whatsapp.net")) {
      telefoneDoLid.set(lid, pn);
      lidDoTelefone.set(pn, lid.split("@")[0]);
    }
  }

  const aproveitadas: WAMessage[] = [];
  for (const mensagem of mensagens) {
    const jid = mensagem.key?.remoteJid;
    if (!jid || !(jid.endsWith("@lid") || jid.endsWith("@s.whatsapp.net"))) continue;
    const ts = segundos(mensagem.messageTimestamp) * 1000;
    if (!Number.isFinite(ts) || ts <= 0 || agora - ts > JANELA_DO_HISTORICO_MS) continue;

    if (jid.endsWith("@lid")) {
      const pn = telefoneDoLid.get(jid);
      aproveitadas.push(
        pn ? { ...mensagem, key: { ...mensagem.key, remoteJid: pn, lid: jid.split("@")[0] } as WAMessage["key"] } : mensagem,
      );
    } else {
      const lid = lidDoTelefone.get(jid);
      aproveitadas.push(lid ? { ...mensagem, key: { ...mensagem.key, lid } as WAMessage["key"] } : mensagem);
    }
  }
  return aproveitadas;
}

/** Janela em que uma mensagem "append" ainda conta como novidade. */
const JANELA_DO_APPEND_MS = 7 * 24 * 60 * 60 * 1000;

export function ehRecente(mensagem: WAMessage, agora: number): boolean {
  const ts = segundos(mensagem.messageTimestamp) * 1000;
  return Number.isFinite(ts) && ts > 0 && agora - ts <= JANELA_DO_APPEND_MS;
}

/** O protobuf pode entregar um `Long`, e `Number(long)` dá NaN: a mensagem seria descartada. */
function segundos(timestamp: WAMessage["messageTimestamp"]): number {
  return typeof timestamp === "object" && timestamp !== null ? Number(timestamp.toString()) : Number(timestamp);
}

function contextoDoAnuncio(mensagem: WAMessage): unknown {
  const partes = Object.values(mensagem.message ?? {}) as Array<{ contextInfo?: unknown } | null>;
  return partes.find((parte) => parte && typeof parte === "object" && parte.contextInfo)?.contextInfo;
}
