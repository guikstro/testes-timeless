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
    wonAt: null,
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
    };
    const conversionEvents = {
      recordLead: jest.fn(),
      recordQualifiedLead: jest.fn(),
      recordPurchase: jest.fn(),
    };
    const service = new ConversationClassifierService(
      prisma as unknown as PrismaService,
      conversionEvents as unknown as ConversionEventsService,
    );
    return { service, prisma, conversionEvents };
  }

  it("does nothing when the message has no text (e.g. media message)", async () => {
    const { service, prisma } = buildService();
    await service.classify({ organizationId: "org-1", lead: buildLead(), messageId: "msg-1", messageText: undefined, occurredAt: new Date() });
    expect(prisma.classificationRule.findMany).not.toHaveBeenCalled();
  });

  it("never re-evaluates a lead that is already WON", async () => {
    const { service, prisma } = buildService();
    await service.classify({
      organizationId: "org-1",
      lead: buildLead({ status: "WON" }),
      messageId: "msg-1",
      messageText: "contrato fechado",
      occurredAt: new Date(),
    });
    expect(prisma.classificationRule.findMany).not.toHaveBeenCalled();
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
      occurredAt: new Date(),
    });

    expect(prisma.lead.update).not.toHaveBeenCalled();
  });

  it("marks WON, creates a Sale, and extracts revenue when a WON trigger matches with a value", async () => {
    const { service, prisma, conversionEvents } = buildService();
    prisma.classificationRule.findMany.mockResolvedValue([
      { id: "rule-2", targetStatus: "WON", phrase: "contrato fechado" },
    ]);

    await service.classify({
      organizationId: "org-1",
      lead: buildLead({ status: "QUALIFIED", qualifiedAt: new Date(0) }),
      messageId: "msg-2",
      messageText: "contrato fechado! Fechamos por 2 mil",
      occurredAt: new Date("2026-01-02T00:00:00Z"),
    });

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { status: "WON", wonAt: new Date("2026-01-02T00:00:00Z") },
    });
    expect(prisma.sale.create).toHaveBeenCalledWith({
      data: {
        organizationId: "org-1",
        leadId: "lead-1",
        amountCents: 200000,
        classifierType: "RULE",
        evidenceMessageId: "msg-2",
        detectedAt: new Date("2026-01-02T00:00:00Z"),
      },
    });
    const eventTypes = prisma.leadEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(eventTypes).toEqual(["SALE_DETECTED", "REVENUE_DETECTED"]);
    expect(conversionEvents.recordPurchase).toHaveBeenCalledWith("org-1", "lead-1", new Date("2026-01-02T00:00:00Z"), 200000);
    // Already QUALIFIED before this message — no implicit re-qualification event sent to Meta.
    expect(conversionEvents.recordQualifiedLead).not.toHaveBeenCalled();
  });

  it("leaves amountCents null (never guesses) when no value can be extracted, and skips REVENUE_DETECTED", async () => {
    const { service, prisma, conversionEvents } = buildService();
    prisma.classificationRule.findMany.mockResolvedValue([
      { id: "rule-2", targetStatus: "WON", phrase: "contrato fechado" },
    ]);

    await service.classify({
      organizationId: "org-1",
      lead: buildLead({ status: "QUALIFIED" }),
      messageId: "msg-2",
      messageText: "contrato fechado, muito obrigado!",
      occurredAt: new Date(),
    });

    expect(prisma.sale.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ amountCents: null }) }),
    );
    const eventTypes = prisma.leadEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(eventTypes).toEqual(["SALE_DETECTED"]);
    // No value known yet — never send an incomplete Purchase to Meta.
    expect(conversionEvents.recordPurchase).not.toHaveBeenCalled();
  });

  it("jumping straight from NEW to WON also synthesizes a QUALIFIED event, to keep the funnel consistent", async () => {
    const { service, prisma, conversionEvents } = buildService();
    prisma.classificationRule.findMany.mockResolvedValue([
      { id: "rule-2", targetStatus: "WON", phrase: "contrato fechado" },
    ]);

    await service.classify({
      organizationId: "org-1",
      lead: buildLead({ status: "NEW" }),
      messageId: "msg-2",
      messageText: "contrato fechado!",
      occurredAt: new Date("2026-01-03T00:00:00Z"),
    });

    expect(prisma.lead.update).toHaveBeenCalledWith({
      where: { id: "lead-1" },
      data: { status: "WON", wonAt: new Date("2026-01-03T00:00:00Z"), qualifiedAt: new Date("2026-01-03T00:00:00Z") },
    });
    const eventTypes = prisma.leadEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(eventTypes).toEqual(["QUALIFIED", "SALE_DETECTED"]);
    expect(conversionEvents.recordQualifiedLead).toHaveBeenCalledWith("org-1", "lead-1", new Date("2026-01-03T00:00:00Z"));
    // "contrato fechado!" has no extractable value — no Purchase sent.
    expect(conversionEvents.recordPurchase).not.toHaveBeenCalled();
  });

  it("prioritizes a WON match over a QUALIFIED match on the same message", async () => {
    const { service, prisma } = buildService();
    prisma.classificationRule.findMany.mockResolvedValue([
      { id: "rule-1", targetStatus: "QUALIFIED", phrase: "vamos marcar" },
      { id: "rule-2", targetStatus: "WON", phrase: "contrato fechado" },
    ]);

    await service.classify({
      organizationId: "org-1",
      lead: buildLead(),
      messageId: "msg-1",
      messageText: "vamos marcar? ah não precisa, contrato fechado já",
      occurredAt: new Date(),
    });

    expect(prisma.sale.create).toHaveBeenCalled();
  });

  it("never creates a second sale when it loses a race to a concurrent message also matching WON", async () => {
    const { service, prisma, conversionEvents } = buildService();
    prisma.classificationRule.findMany.mockResolvedValue([
      { id: "rule-2", targetStatus: "WON", phrase: "fechado" },
    ]);
    prisma.sale.create.mockRejectedValue(uniqueConstraintError());

    await expect(
      service.classify({
        organizationId: "org-1",
        lead: buildLead({ status: "QUALIFIED" }),
        messageId: "msg-2",
        messageText: "fechado!",
        occurredAt: new Date(),
      }),
    ).resolves.not.toThrow();

    const eventTypes = prisma.leadEvent.create.mock.calls.map((c) => c[0].data.type);
    expect(eventTypes).not.toContain("SALE_DETECTED");
    expect(conversionEvents.recordPurchase).not.toHaveBeenCalled();
  });
});
