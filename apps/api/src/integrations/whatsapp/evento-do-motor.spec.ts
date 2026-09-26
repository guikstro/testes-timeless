import type { WAMessage } from "baileys";
import { parseEvolutionPayload } from "../../whatsapp-webhook/parse-evolution-payload";
import { eventoDeConexao, eventoDeMensagem } from "./evento-do-motor";

/** O que importa é o evento do motor passar pelo parser que já existia. */
describe("evento do motor", () => {
  const mensagem = (sobrescreve: Partial<WAMessage> = {}): WAMessage =>
    ({
      key: { remoteJid: "5585999999999@s.whatsapp.net", fromMe: false, id: "3EB0ABC" },
      pushName: "Ana",
      messageTimestamp: 1758900000,
      message: { conversation: "Olá" },
      ...sobrescreve,
    }) as WAMessage;

  it("vira o mesmo job que a Evolution gerava", () => {
    const resultado = parseEvolutionPayload(eventoDeMensagem("org-1", mensagem()));

    expect(resultado).toMatchObject({
      kind: "message",
      job: { routingKey: "org-1", waId: "5585999999999", messageId: "3EB0ABC", text: "Olá", timestampSeconds: 1758900000 },
    });
  });

  it("usa o telefone real quando o contato chega como LID", () => {
    const lid = mensagem({
      key: { remoteJid: "123456@lid", senderPn: "5585988887777@s.whatsapp.net", fromMe: false, id: "3EB0LID" },
    });

    expect(parseEvolutionPayload(eventoDeMensagem("org-1", lid))).toMatchObject({ job: { waId: "5585988887777" } });
  });

  it("aceita o timestamp em Long do protobuf", () => {
    const long = mensagem({ messageTimestamp: { toString: () => "1758900000" } as never });

    expect(parseEvolutionPayload(eventoDeMensagem("org-1", long))).toMatchObject({ job: { timestampSeconds: 1758900000 } });
  });

  it("traz a origem do anúncio (CTWA) para onde o parser procura", () => {
    const doAnuncio = mensagem({
      message: {
        extendedTextMessage: {
          text: "Vi o anúncio",
          contextInfo: { ctwaClid: "clid-1", externalAdReply: { sourceId: "ad-9" } },
        },
      } as never,
    });

    expect(parseEvolutionPayload(eventoDeMensagem("org-1", doAnuncio))).toMatchObject({
      job: { text: "Vi o anúncio", referral: { ctwaClid: "clid-1", sourceId: "ad-9" } },
    });
  });

  it("repassa a mudança de conexão", () => {
    expect(parseEvolutionPayload(eventoDeConexao("org-1", "open"))).toEqual({
      kind: "connection",
      instanceName: "org-1",
      state: "open",
    });
  });
});
