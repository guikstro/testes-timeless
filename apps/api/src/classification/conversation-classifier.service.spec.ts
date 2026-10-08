import { DeterministicSaleClassifier } from "../sales/sale-classifier";
import { Lead, Prisma } from "@prisma/client";
import { ConversationClassifierService } from "./conversation-classifier.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { ConversionEventsService } from "../integrations/meta/conversion-events.service";

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

function buildLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: "lead-1",
    organizationId: "org-1",
    normalizedPhone: "+5585999999999",
    rawPhone: "5585999999999",
    name: "João",
    status: "NEW",
    firstContactAt: new Date(0),
    lastContactAt: new Date(0),
    qualifiedAt: null,
    meetingScheduledAt: null,
    wonAt: null,
    disqualifiedAt: null,
    disqualifiedReason: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  } as Lead;
}

describe("ConversationClassifierService", () => {
  function buildService() {
    const prisma = {
      classificationRule: { findMany: jest.fn().mockResolvedValue([]) },
      lead: { update: jest.fn() },
      leadEvent: { create: jest.fn() },
      sale: { create: jest.fn() },
      organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ currency: "BRL" }) },
      message: { findFirst: jest.fn().mockResolvedValue({ conversation: { coverage: "PARTIAL" } }) },
    };
    const conversionEvents = {
      recordLead: jest.fn(),
      recordQualifiedLead: jest.fn(),
      recordPurchase: jest.fn(),
    };
    const sales = { record: jest.fn() };
    const service = new ConversationClassifierService(
      prisma as unknown as PrismaService,
      conversionEvents as unknown as ConversionEventsService,
      sales as never, new DeterministicSaleClassifier(),
    );
    return { service, prisma, conversionEvents, sales };
  }

  it("does nothing when the message has no text (e.g. media message)", async () => {
    const { service, prisma } = buildService();
    await service.classify({ organizationId: "org-1", lead: buildLead(), messageId: "msg-1", messageText: undefined, occurredAt: new Date(), direction: "INBOUND" });
    expect(prisma.classificationRule.findMany).not.toHaveBeenCalled();
  });

  it("continues reading evidence after the lead lifecycle reaches WON", async () => {
    const { service, prisma } = buildService();
    await service.classify({
      organizationId: "org-1",
      lead: buildLead({ status: "WON" }),
      messageId: "msg-1",
      messageText: "contrato fechado",
      direction: "INBOUND",
      occurredAt: new Date(),
    });
    expect(prisma.classificationRule.findMany).toHaveBeenCalled();
  });

  it("qualifies a NEW lead when a QUALIFIED trigger matches", async () => {
    const { service, prisma, conversionEvents } = buildService();
    prisma.classificationRule.findMany.mockResolvedValue([
      { id: "rule-1", targetStatus: "QUALIFIED", phrase: "vamos marcar sua consulta" },
    ]);

    await service.classify({
      organizationId: "org-1",
      lead: buildLead(),
      messageId: "msg-1",
      messageText: "beleza, vamos marcar sua consulta amanhã",
      direction: "INBOUND",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { status: "QUALIFIED", qualifiedAt: new Date("2026-01-01T00:00:00Z") },
    });
    const eventTypes = prisma.leadEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(eventTypes).toEqual(["QUALIFIED"]);
    expect(prisma.sale.create).not.toHaveBeenCalled();
    expect(conversionEvents.recordQualifiedLead).toHaveBeenCalledWith("org-1", "lead-1", new Date("2026-01-01T00:00:00Z"));
  });

  it("qualifica um lead em atendimento: a resposta da equipe não impede a qualificação", async () => {
    const { service, prisma } = buildService();
    prisma.classificationRule.findMany.mockResolvedValue([
      { id: "rule-1", targetStatus: "QUALIFIED", phrase: "quero agendar" },
    ]);

    await service.classify({
      organizationId: "org-1",
      lead: buildLead({ status: "IN_PROGRESS" }),
      messageId: "msg-1",
      messageText: "quero agendar para semana que vem",
      direction: "INBOUND",
      occurredAt: new Date("2026-01-01T00:00:00Z"),
    });

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { status: "QUALIFIED", qualifiedAt: new Date("2026-01-01T00:00:00Z") },
    });
  });

  it("does not qualify a lead that is already QUALIFIED or WON (no re-firing)", async () => {
    const { service, prisma } = buildService();
    prisma.classificationRule.findMany.mockResolvedValue([
      { id: "rule-1", targetStatus: "QUALIFIED", phrase: "vamos marcar sua consulta" },
    ]);

    await service.classify({
      organizationId: "org-1",
      lead: buildLead({ status: "QUALIFIED" }),
      messageId: "msg-1",
      messageText: "vamos marcar sua consulta de novo?",
      direction: "INBOUND",
      occurredAt: new Date(),
    });

    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it.each(["INBOUND", "OUTBOUND"] as const)("records a possible sale from %s without changing the lead or sending Purchase", async (direction) => {
    const { service, prisma, sales, conversionEvents } = buildService();
    prisma.classificationRule.findMany.mockResolvedValue([{ targetStatus: "WON", phrase: "contrato fechado" }]);
    await service.classify({ organizationId: "org-1", lead: buildLead(), messageId: "msg-1", messageText: "contrato fechado por R$ 850,00", direction, occurredAt: new Date() });
    expect(sales.record).toHaveBeenCalledWith(expect.objectContaining({ source: "CONVERSATION", status: "POSSIBLE", valueCents: 85000, eventKey: "message:msg-1" }));
    expect(prisma.lead.update).not.toHaveBeenCalled();
    expect(conversionEvents.recordPurchase).not.toHaveBeenCalled();
  });

  it.each(["não fechamos", "se fechamos amanhã", "talvez fechamos"])("does not detect a sale for %s", async (text) => {
    const { service, prisma, sales } = buildService();
    prisma.classificationRule.findMany.mockResolvedValue([{ targetStatus: "WON", phrase: "fechamos" }]);
    await service.classify({ organizationId: "org-1", lead: buildLead(), messageId: "msg-1", messageText: text, direction: "INBOUND", occurredAt: new Date() });
    expect(sales.record).not.toHaveBeenCalled();
  });

  describe("reunião marcada (Fase 11)", () => {
    const meetingRule = { id: "rule-m", targetStatus: "MEETING_SCHEDULED", phrase: "agendei para" };

    function classify(service: ConversationClassifierService, direction: "INBOUND" | "OUTBOUND", lead = buildLead()) {
      return service.classify({
        organizationId: "org-1",
        lead,
        messageId: "msg-1",
        messageText: "agendei para terça às 15h",
        occurredAt: new Date("2026-01-05T12:00:00Z"),
        direction,
      });
    }

    it("marca reunião a partir de uma mensagem do lead", async () => {
      const { service, prisma } = buildService();
      prisma.classificationRule.findMany.mockResolvedValue([meetingRule]);

      await classify(service, "INBOUND");

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "MEETING_SCHEDULED", meetingScheduledAt: expect.any(Date) }),
        }),
      );
    });

    /** O caso que motivou a mudança: quem agenda é o atendente, não o lead. */
    it("marca reunião a partir de uma mensagem da equipe", async () => {
      const { service, prisma } = buildService();
      prisma.classificationRule.findMany.mockResolvedValue([meetingRule]);

      await classify(service, "OUTBOUND");

      expect(prisma.lead.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "MEETING_SCHEDULED" }) }),
      );
    });

    /**
     * A trava que torna seguro ler as mensagens da própria equipe: um atendente
     * escrevendo "contrato fechado" criaria uma venda que não aconteceu.
     */
    it("nunca registra venda a partir de uma mensagem da equipe", async () => {
      const { service, prisma } = buildService();
      prisma.classificationRule.findMany.mockResolvedValue([
        { id: "rule-w", targetStatus: "WON", phrase: "contrato fechado" },
      ]);

      await service.classify({
        organizationId: "org-1",
        lead: buildLead(),
        messageId: "msg-1",
        messageText: "assim que sair o contrato fechado eu te aviso",
        occurredAt: new Date(),
        direction: "OUTBOUND",
      });

      expect(prisma.sale.create).not.toHaveBeenCalled();
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it("nunca qualifica a partir de uma mensagem da equipe", async () => {
      const { service, prisma } = buildService();
      prisma.classificationRule.findMany.mockResolvedValue([
        { id: "rule-q", targetStatus: "QUALIFIED", phrase: "quero contratar" },
      ]);

      await service.classify({
        organizationId: "org-1",
        lead: buildLead(),
        messageId: "msg-1",
        messageText: "se você quero contratar é só avisar",
        occurredAt: new Date(),
        direction: "OUTBOUND",
      });

      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it("qualifica implicitamente ao marcar reunião de um lead novo", async () => {
      const { service, prisma, conversionEvents } = buildService();
      prisma.classificationRule.findMany.mockResolvedValue([meetingRule]);

      await classify(service, "INBOUND");

      expect(prisma.lead.update.mock.calls[0][0].data.qualifiedAt).toEqual(expect.any(Date));
      expect(conversionEvents.recordQualifiedLead).toHaveBeenCalled();
    });

    it("não requalifica um lead que já estava qualificado", async () => {
      const { service, prisma, conversionEvents } = buildService();
      prisma.classificationRule.findMany.mockResolvedValue([meetingRule]);

      await classify(service, "INBOUND", buildLead({ status: "QUALIFIED", qualifiedAt: new Date(0) }));

      expect(prisma.lead.update.mock.calls[0][0].data.qualifiedAt).toBeUndefined();
      expect(conversionEvents.recordQualifiedLead).not.toHaveBeenCalled();
    });

    /** Só avança: quem já tem reunião não a remarca por outra frase igual. */
    it("ignora o gatilho quando o lead já está em reunião marcada", async () => {
      const { service, prisma } = buildService();
      prisma.classificationRule.findMany.mockResolvedValue([meetingRule]);

      await classify(service, "INBOUND", buildLead({ status: "MEETING_SCHEDULED" }));

      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    /** Entre dois gatilhos na mesma mensagem, vence o estágio mais avançado. */
    it("registra evidência sem substituir o estágio de reunião", async () => {
      const { service, prisma } = buildService();
      prisma.classificationRule.findMany.mockResolvedValue([
        meetingRule,
        { id: "rule-w", targetStatus: "WON", phrase: "agendei para" },
      ]);

      await classify(service, "INBOUND");

      expect(prisma.sale.create).not.toHaveBeenCalled();
      expect(prisma.lead.update.mock.calls[0][0].data.status).toBe("MEETING_SCHEDULED");
    });

    /** Automático e manual não podem divergir no mesmo funil. */
    it("reativa um lead desqualificado ao marcar reunião", async () => {
      const { service, prisma } = buildService();
      prisma.classificationRule.findMany.mockResolvedValue([meetingRule]);

      await classify(service, "INBOUND", buildLead({ disqualifiedAt: new Date(0), disqualifiedReason: "Sem verba" }));

      expect(prisma.lead.update.mock.calls[0][0].data).toMatchObject({
        disqualifiedAt: null,
        disqualifiedReason: null,
      });
      const eventTypes = prisma.leadEvent.create.mock.calls.map((c) => c[0].data.type);
      expect(eventTypes).toContain("REACTIVATED");
    });

    it("registra na timeline de qual lado veio o gatilho", async () => {
      const { service, prisma } = buildService();
      prisma.classificationRule.findMany.mockResolvedValue([meetingRule]);

      await classify(service, "OUTBOUND");

      const meetingEvent = prisma.leadEvent.create.mock.calls
        .map((c) => c[0].data)
        .find((data) => data.type === "MEETING_SCHEDULED");
      expect(meetingEvent.metadata).toMatchObject({ direction: "OUTBOUND", phrase: "agendei para" });
    });
  });
});
