import type { WAMessage } from "baileys";
import { parseEvolutionPayload } from "../../whatsapp-webhook/parse-evolution-payload";
import { ehRecente, eventoDeConexao, eventoDeMensagem, mensagensDoHistorico } from "./evento-do-motor";

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

  it("guarda o LID original quando troca o endereço pelo telefone", () => {
    const evento = eventoDeMensagem("org", {
      key: { remoteJid: "123456@lid", senderPn: "5585988887777@s.whatsapp.net", fromMe: false, id: "A" },
      messageTimestamp: 1700000000,
    } as never);
    expect((evento.data.key as { remoteJid: string; lid: string })).toMatchObject({ remoteJid: "5585988887777@s.whatsapp.net", lid: "123456" });
  });

  it("só aceita como novidade o que é recente (mensagens append)", () => {
    const agora = Date.now();
    expect(ehRecente({ messageTimestamp: Math.floor(agora / 1000) - 3600 } as never, agora)).toBe(true);
    expect(ehRecente({ messageTimestamp: Math.floor(agora / 1000) - 30 * 86400 } as never, agora)).toBe(false);
  });

  describe("mensagens do histórico pedido ao celular", () => {
    const agora = 1_700_000_000_000;
    const msg = (remoteJid: string, fromMe: boolean, dias = 1) =>
      ({ key: { remoteJid, fromMe, id: `${remoteJid}-${fromMe}` }, messageTimestamp: agora / 1000 - dias * 86400, message: { conversation: "oi" } }) as never;

    it("troca o LID pelo telefone que a lista de conversas informa e guarda o LID", () => {
      const [m] = mensagensDoHistorico([{ id: "123@lid", pnJid: "5585988887777@s.whatsapp.net" }], [msg("123@lid", true)], agora);
      expect((m as { key: object }).key).toMatchObject({ remoteJid: "5585988887777@s.whatsapp.net", lid: "123", fromMe: true });
    });

    it("guarda o LID quando a conversa vem pelo telefone", () => {
      const [m] = mensagensDoHistorico([{ id: "5585988887777@s.whatsapp.net", lidJid: "123@lid" }], [msg("5585988887777@s.whatsapp.net", false)], agora);
      expect((m as { key: object }).key).toMatchObject({ lid: "123" });
    });

    it("descarta grupos e o que é mais antigo que trinta dias", () => {
      expect(mensagensDoHistorico([], [msg("1@g.us", false), msg("5585@s.whatsapp.net", true, 40)], agora)).toHaveLength(0);
    });

    it("marca o evento como histórico", () => {
      expect(eventoDeMensagem("org", msg("5585@s.whatsapp.net", true), { historico: true }).data).toMatchObject({ historico: true });
    });
  });
});
