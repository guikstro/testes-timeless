import { WhatsAppSendService } from "./whatsapp-send.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EvolutionClient } from "../../integrations/whatsapp/evolution-client";
import { EvolutionApiError } from "../../integrations/whatsapp/evolution-api-error";
import { ConversationClassifierService } from "../../classification/conversation-classifier.service";

describe("WhatsAppSendService", () => {
  function buildService() {
    const prisma = { message: { findUnique: jest.fn(), update: jest.fn() } };
    const evolution = { sendText: jest.fn().mockResolvedValue({ externalId: "3EB0SENT" }) };
    const classifier = { classify: jest.fn() };
    const service = new WhatsAppSendService(
      prisma as unknown as PrismaService,
      evolution as unknown as EvolutionClient,
      classifier as unknown as ConversationClassifierService,
    );
    return { service, prisma, evolution, classifier };
  }

  function messageRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "msg-1",
      direction: "OUTBOUND",
      text: "Olá, tudo bem?",
      outboundStatus: "PENDING",
      timestamp: new Date("2026-01-10T10:00:00Z"),
      conversation: {
        lead: { id: "lead-1", organizationId: "org-1", normalizedPhone: "+5585999999999" },
        whatsappConnection: { status: "CONNECTED", provider: "EVOLUTION", instanceName: "org-123" },
      },
      ...overrides,
    };
  }

  it("does nothing when the message no longer exists", async () => {
    const { service, prisma, evolution } = buildService();
    prisma.message.findUnique.mockResolvedValue(null);

    await service.send("msg-1", false);

    expect(evolution.sendText).not.toHaveBeenCalled();
  });

  it("never re-sends a message a previous attempt already delivered", async () => {
    const { service, prisma, evolution } = buildService();
    prisma.message.findUnique.mockResolvedValue(messageRow({ outboundStatus: "SENT" }));

    await service.send("msg-1", false);

    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(prisma.message.update).not.toHaveBeenCalled();
  });

  it("refuses to send an INBOUND message (defensive — the queue should never carry one)", async () => {
    const { service, prisma, evolution } = buildService();
    prisma.message.findUnique.mockResolvedValue(messageRow({ direction: "INBOUND" }));

    await service.send("msg-1", false);

    expect(evolution.sendText).not.toHaveBeenCalled();
  });

  it("fails without throwing when the connection dropped between enqueue and send", async () => {
    const { service, prisma, evolution } = buildService();
    prisma.message.findUnique.mockResolvedValue(
      messageRow({
        conversation: {
          lead: { normalizedPhone: "+5585999999999" },
          whatsappConnection: { status: "PENDING_QR", provider: "EVOLUTION", instanceName: "org-123" },
        },
      }),
    );

    await expect(service.send("msg-1", false)).resolves.not.toThrow();

    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      data: expect.objectContaining({ outboundStatus: "FAILED" }),
    });
  });

  it("fails explicitly for a Cloud API connection instead of pretending the message went out", async () => {
    const { service, prisma, evolution } = buildService();
    prisma.message.findUnique.mockResolvedValue(
      messageRow({
        conversation: {
          lead: { normalizedPhone: "+5585999999999" },
          whatsappConnection: { status: "CONNECTED", provider: "CLOUD_API", phoneNumberId: "phone-1" },
        },
      }),
    );

    await service.send("msg-1", false);

    expect(evolution.sendText).not.toHaveBeenCalled();
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      data: expect.objectContaining({ outboundStatus: "FAILED" }),
    });
  });

  it("sends the text to the lead's number without the leading + and records the provider's id", async () => {
    const { service, prisma, evolution } = buildService();
    prisma.message.findUnique.mockResolvedValue(messageRow());

    await service.send("msg-1", false);

    expect(evolution.sendText).toHaveBeenCalledWith("org-123", "5585999999999", "Olá, tudo bem?");
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      data: { outboundStatus: "SENT", externalId: "3EB0SENT", sendError: null },
    });
  });

  it("keeps the message retryable (not FAILED) and re-throws when attempts remain", async () => {
    const { service, prisma, evolution } = buildService();
    prisma.message.findUnique.mockResolvedValue(messageRow());
    evolution.sendText.mockRejectedValue(new EvolutionApiError("Connection Closed", 400));

    await expect(service.send("msg-1", false)).rejects.toThrow("Connection Closed");

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      data: { sendError: "Connection Closed" },
    });
  });

  it("marks FAILED on the last configured attempt, and still re-throws so BullMQ records it", async () => {
    const { service, prisma, evolution } = buildService();
    prisma.message.findUnique.mockResolvedValue(messageRow());
    evolution.sendText.mockRejectedValue(new EvolutionApiError("Connection Closed", 400));

    await expect(service.send("msg-1", true)).rejects.toThrow("Connection Closed");

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: "msg-1" },
      data: { outboundStatus: "FAILED", sendError: "Connection Closed" },
    });
  });

  describe("classificação da mensagem enviada (Fase 11)", () => {
    it("classifica como OUTBOUND depois do envio confirmado", async () => {
      const { service, prisma, classifier } = buildService();
      prisma.message.findUnique.mockResolvedValue(messageRow({ text: "agendei para terça às 15h" }));

      await service.send("msg-1", false);

      expect(classifier.classify).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: "org-1",
          messageText: "agendei para terça às 15h",
          direction: "OUTBOUND",
        }),
      );
    });

    /**
     * Uma mensagem que não saiu não combinou horário com ninguém — mesma
     * lógica que já exclui uma OUTBOUND falhada do tempo de resposta.
     */
    it("não classifica quando o envio falhou", async () => {
      const { service, prisma, evolution, classifier } = buildService();
      prisma.message.findUnique.mockResolvedValue(messageRow());
      evolution.sendText.mockRejectedValue(new EvolutionApiError("Connection Closed", 500));

      await expect(service.send("msg-1", true)).rejects.toThrow();

      expect(classifier.classify).not.toHaveBeenCalled();
    });

    it("não classifica quando o WhatsApp está desconectado", async () => {
      const { service, prisma, classifier } = buildService();
      prisma.message.findUnique.mockResolvedValue(
        messageRow({
          conversation: {
            lead: { id: "lead-1", organizationId: "org-1", normalizedPhone: "+5585999999999" },
            whatsappConnection: { status: "DISCONNECTED", provider: "EVOLUTION", instanceName: "org-123" },
          },
        }),
      );

      await service.send("msg-1", false);

      expect(classifier.classify).not.toHaveBeenCalled();
    });
  });
});
