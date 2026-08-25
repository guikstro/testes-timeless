import { Prisma } from "@prisma/client";
import { WhatsAppIngestionService } from "./whatsapp-ingestion.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AttributionEngine } from "../../attribution/attribution-engine";
import { ConversationClassifierService } from "../../classification/conversation-classifier.service";
import { ConversionEventsService } from "../../integrations/meta/conversion-events.service";
import { WhatsAppInboundMessageJob } from "../../common/queue/whatsapp-event.job";

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "test",
  });
}

function buildJob(overrides: Partial<WhatsAppInboundMessageJob> = {}): WhatsAppInboundMessageJob {
  return {
    phoneNumberId: "phone-1",
    waId: "5585999999999",
    profileName: "João",
    messageId: "wamid.ABC123",
    type: "text",
    text: "Fui demitido e não recebi tudo",
    timestampSeconds: 1700000000,
    ...overrides,
  };
}

const UNKNOWN_ATTRIBUTION = { method: "UNKNOWN", confidence: "NONE", trackingClickId: null, evidence: Prisma.JsonNull };

describe("WhatsAppIngestionService", () => {
  function buildPrismaMock() {
    return {
      message: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: "msg-created-1" }) },
      whatsAppConnection: {
        findUnique: jest.fn().mockResolvedValue({
          id: "conn-1",
          organizationId: "org-1",
          phoneNumberId: "phone-1",
        }),
        update: jest.fn(),
      },
      lead: {
        findUnique: jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      conversation: {
        findFirst: jest.fn().mockResolvedValue(null),
        findFirstOrThrow: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      leadEvent: { create: jest.fn() },
      attribution: { create: jest.fn() },
    };
  }

  function buildAttributionEngineMock() {
    return { resolve: jest.fn().mockResolvedValue(UNKNOWN_ATTRIBUTION) };
  }

  function buildClassifierMock() {
    return { classify: jest.fn().mockResolvedValue(undefined) };
  }

  function buildConversionEventsMock() {
    return { recordLead: jest.fn(), recordQualifiedLead: jest.fn(), recordPurchase: jest.fn() };
  }

  function buildService(
    prisma: ReturnType<typeof buildPrismaMock>,
    attributionEngine = buildAttributionEngineMock(),
    classifier = buildClassifierMock(),
    conversionEvents = buildConversionEventsMock(),
  ) {
    return new WhatsAppIngestionService(
      prisma as unknown as PrismaService,
      attributionEngine as unknown as AttributionEngine,
      classifier as unknown as ConversationClassifierService,
      conversionEvents as unknown as ConversionEventsService,
    );
  }

  it("skips a message that was already processed (idempotency)", async () => {
    const prisma = buildPrismaMock();
    prisma.message.findUnique.mockResolvedValue({ id: "msg-1", externalId: "wamid.ABC123" });
    const service = buildService(prisma);

    await service.ingest(buildJob());

    expect(prisma.whatsAppConnection.findUnique).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("drops the event when the phone_number_id doesn't match any connection", async () => {
    const prisma = buildPrismaMock();
    prisma.whatsAppConnection.findUnique.mockResolvedValue(null);
    const service = buildService(prisma);

    await service.ingest(buildJob());

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("creates exactly one lead, one conversation, and one message on first contact, with the full timeline", async () => {
    const prisma = buildPrismaMock();
    prisma.lead.create.mockResolvedValue({ id: "lead-1", name: null, lastContactAt: new Date(0) });
    prisma.conversation.create.mockResolvedValue({ id: "conv-1", lastMessageAt: new Date(0) });
    const service = buildService(prisma);

    await service.ingest(buildJob());

    expect(prisma.lead.create).toHaveBeenCalledTimes(1);
    expect(prisma.lead.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        normalizedPhone: "+5585999999999",
        rawPhone: "5585999999999",
        name: "João",
      }),
    });

    expect(prisma.conversation.create).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ leadId: "lead-1", whatsappConnectionId: "conn-1" }),
    });

    expect(prisma.message.create).toHaveBeenCalledTimes(1);
    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        conversationId: "conv-1",
        externalId: "wamid.ABC123",
        direction: "INBOUND",
        type: "TEXT",
        text: "Fui demitido e não recebi tudo",
      }),
    });

    const eventTypes = prisma.leadEvent.create.mock.calls.map((call) => call[0].data.type);
    expect(eventTypes).toEqual(["LEAD_CREATED", "CONVERSATION_STARTED", "MESSAGE_RECEIVED"]);
  });

  it("reuses the same lead for a second message from the same phone (deduplication) — no second LEAD_CREATED", async () => {
    const prisma = buildPrismaMock();
    const existingLead = { id: "lead-1", name: "João", lastContactAt: new Date("2026-01-01T00:00:00Z") };
    prisma.lead.findUnique.mockResolvedValue(existingLead);
    prisma.lead.update.mockResolvedValue(existingLead);
    const existingConversation = { id: "conv-1", lastMessageAt: new Date("2026-01-01T00:00:00Z") };
    prisma.conversation.findFirst.mockResolvedValue(existingConversation);
    prisma.conversation.update.mockResolvedValue(existingConversation);
    const service = buildService(prisma);

    await service.ingest(buildJob({ messageId: "wamid.SECOND", timestampSeconds: 1700000100 }));

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.conversation.create).not.toHaveBeenCalled();

    const eventTypes = prisma.leadEvent.create.mock.calls.map((call) => call[0].data.type);
    expect(eventTypes).toEqual(["MESSAGE_RECEIVED"]);
  });

  it("reloads the lead instead of failing when it loses a create race to a concurrent delivery", async () => {
    const prisma = buildPrismaMock();
    prisma.lead.create.mockRejectedValue(uniqueConstraintError());
    const raceWinnerLead = { id: "lead-from-race", name: "João", lastContactAt: new Date(0) };
    prisma.lead.findUniqueOrThrow.mockResolvedValue(raceWinnerLead);
    prisma.conversation.create.mockResolvedValue({ id: "conv-1", lastMessageAt: new Date(0) });
    const service = buildService(prisma);

    await service.ingest(buildJob());

    expect(prisma.lead.findUniqueOrThrow).toHaveBeenCalledTimes(1);
    expect(prisma.conversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ leadId: "lead-from-race" }),
    });
    // The lead already existed (from the other side of the race) — no LEAD_CREATED here.
    const eventTypes = prisma.leadEvent.create.mock.calls.map((call) => call[0].data.type);
    expect(eventTypes).not.toContain("LEAD_CREATED");
  });

  it("does nothing further when it loses the message-create race (message already recorded by a concurrent delivery)", async () => {
    const prisma = buildPrismaMock();
    prisma.lead.create.mockResolvedValue({ id: "lead-1", name: null, lastContactAt: new Date(0) });
    prisma.conversation.create.mockResolvedValue({ id: "conv-1", lastMessageAt: new Date(0) });
    prisma.message.create.mockRejectedValue(uniqueConstraintError());
    const service = buildService(prisma);

    await service.ingest(buildJob());

    const eventTypes = prisma.leadEvent.create.mock.calls.map((call) => call[0].data.type);
    expect(eventTypes).not.toContain("MESSAGE_RECEIVED");
    expect(prisma.whatsAppConnection.update).not.toHaveBeenCalled();
  });

  it("records a non-text message as type OTHER with no stored text", async () => {
    const prisma = buildPrismaMock();
    prisma.lead.create.mockResolvedValue({ id: "lead-1", name: null, lastContactAt: new Date(0) });
    prisma.conversation.create.mockResolvedValue({ id: "conv-1", lastMessageAt: new Date(0) });
    const service = buildService(prisma);

    await service.ingest(buildJob({ type: "other", text: undefined, messageId: "wamid.IMG" }));

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "OTHER", text: undefined }),
    });
  });

  describe("attribution (Fase 4)", () => {
    it("resolves and persists attribution exactly once, only when the lead is newly created", async () => {
      const prisma = buildPrismaMock();
      prisma.lead.create.mockResolvedValue({ id: "lead-1", name: null, lastContactAt: new Date(0) });
      prisma.conversation.create.mockResolvedValue({ id: "conv-1", lastMessageAt: new Date(0) });
      const attributionEngine = buildAttributionEngineMock();
      attributionEngine.resolve.mockResolvedValue({
        method: "TRACKING_LINK",
        confidence: "HIGH",
        trackingClickId: "click-1",
        evidence: { utmCampaign: "direito-trabalhista" },
      });
      const service = buildService(prisma, attributionEngine);

      await service.ingest(buildJob({ text: "oi [ref:AB12CD]" }));

      expect(attributionEngine.resolve).toHaveBeenCalledWith({
        organizationId: "org-1",
        messageText: "oi [ref:AB12CD]",
        referral: undefined,
      });
      expect(prisma.attribution.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          leadId: "lead-1",
          method: "TRACKING_LINK",
          confidence: "HIGH",
          trackingClickId: "click-1",
          evidence: { utmCampaign: "direito-trabalhista" },
        },
      });
    });

    it("never resolves or persists attribution for a message from an already-existing lead (first-touch only)", async () => {
      const prisma = buildPrismaMock();
      const existingLead = { id: "lead-1", name: "João", lastContactAt: new Date(0) };
      prisma.lead.findUnique.mockResolvedValue(existingLead);
      prisma.lead.update.mockResolvedValue(existingLead);
      const existingConversation = { id: "conv-1", lastMessageAt: new Date(0) };
      prisma.conversation.findFirst.mockResolvedValue(existingConversation);
      prisma.conversation.update.mockResolvedValue(existingConversation);
      const attributionEngine = buildAttributionEngineMock();
      const service = buildService(prisma, attributionEngine);

      // Even though this later message carries a (different) reference
      // token, it must never overwrite the lead's first-touch attribution.
      await service.ingest(buildJob({ messageId: "wamid.SECOND", text: "oi [ref:LATER1]" }));

      expect(attributionEngine.resolve).not.toHaveBeenCalled();
      expect(prisma.attribution.create).not.toHaveBeenCalled();
    });

    it("passes the referral block through to the attribution engine untouched", async () => {
      const prisma = buildPrismaMock();
      prisma.lead.create.mockResolvedValue({ id: "lead-1", name: null, lastContactAt: new Date(0) });
      prisma.conversation.create.mockResolvedValue({ id: "conv-1", lastMessageAt: new Date(0) });
      const attributionEngine = buildAttributionEngineMock();
      const service = buildService(prisma, attributionEngine);
      const referral = { ctwaClid: "ctwa.abc", sourceId: "ad-1" };

      await service.ingest(buildJob({ referral }));

      expect(attributionEngine.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ referral }),
      );
    });
  });

  describe("conversion events (Fase 7)", () => {
    it("records a Meta Lead event exactly once, only when the lead is newly created", async () => {
      const prisma = buildPrismaMock();
      prisma.lead.create.mockResolvedValue({ id: "lead-1", name: null, lastContactAt: new Date(0) });
      prisma.conversation.create.mockResolvedValue({ id: "conv-1", lastMessageAt: new Date(0) });
      const conversionEvents = buildConversionEventsMock();
      const service = buildService(prisma, buildAttributionEngineMock(), buildClassifierMock(), conversionEvents);

      await service.ingest(buildJob());

      expect(conversionEvents.recordLead).toHaveBeenCalledTimes(1);
      expect(conversionEvents.recordLead).toHaveBeenCalledWith("org-1", "lead-1", expect.any(Date));
    });

    it("never records a Meta Lead event for a message from an already-existing lead", async () => {
      const prisma = buildPrismaMock();
      const existingLead = { id: "lead-1", name: "João", lastContactAt: new Date(0) };
      prisma.lead.findUnique.mockResolvedValue(existingLead);
      prisma.lead.update.mockResolvedValue(existingLead);
      const existingConversation = { id: "conv-1", lastMessageAt: new Date(0) };
      prisma.conversation.findFirst.mockResolvedValue(existingConversation);
      prisma.conversation.update.mockResolvedValue(existingConversation);
      const conversionEvents = buildConversionEventsMock();
      const service = buildService(prisma, buildAttributionEngineMock(), buildClassifierMock(), conversionEvents);

      await service.ingest(buildJob({ messageId: "wamid.SECOND" }));

      expect(conversionEvents.recordLead).not.toHaveBeenCalled();
    });
  });

  describe("classification (Fase 5)", () => {
    it("classifies every message, not just the first, with the current lead and the created message's internal id", async () => {
      const prisma = buildPrismaMock();
      const existingLead = { id: "lead-1", status: "QUALIFIED", name: "João", lastContactAt: new Date(0) };
      prisma.lead.findUnique.mockResolvedValue(existingLead);
      prisma.lead.update.mockResolvedValue(existingLead);
      const existingConversation = { id: "conv-1", lastMessageAt: new Date(0) };
      prisma.conversation.findFirst.mockResolvedValue(existingConversation);
      prisma.conversation.update.mockResolvedValue(existingConversation);
      prisma.message.create.mockResolvedValue({ id: "msg-internal-2" });
      const classifier = buildClassifierMock();
      const service = buildService(prisma, buildAttributionEngineMock(), classifier);

      await service.ingest(buildJob({ messageId: "wamid.SECOND", text: "contrato fechado" }));

      expect(classifier.classify).toHaveBeenCalledWith({
        organizationId: "org-1",
        lead: existingLead,
        messageId: "msg-internal-2",
        messageText: "contrato fechado",
        occurredAt: expect.any(Date),
      });
    });

    it("never classifies a non-text message (nothing to match a phrase against)", async () => {
      const prisma = buildPrismaMock();
      prisma.lead.create.mockResolvedValue({ id: "lead-1", name: null, lastContactAt: new Date(0) });
      prisma.conversation.create.mockResolvedValue({ id: "conv-1", lastMessageAt: new Date(0) });
      const classifier = buildClassifierMock();
      const service = buildService(prisma, buildAttributionEngineMock(), classifier);

      await service.ingest(buildJob({ type: "other", text: undefined }));

      expect(classifier.classify).toHaveBeenCalledWith(expect.objectContaining({ messageText: undefined }));
    });

    it("never classifies when it lost the message-create race (nothing new happened)", async () => {
      const prisma = buildPrismaMock();
      prisma.lead.create.mockResolvedValue({ id: "lead-1", name: null, lastContactAt: new Date(0) });
      prisma.conversation.create.mockResolvedValue({ id: "conv-1", lastMessageAt: new Date(0) });
      prisma.message.create.mockRejectedValue(uniqueConstraintError());
      const classifier = buildClassifierMock();
      const service = buildService(prisma, buildAttributionEngineMock(), classifier);

      await service.ingest(buildJob());

      expect(classifier.classify).not.toHaveBeenCalled();
    });
  });
});
