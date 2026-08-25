import { Prisma } from "@prisma/client";
import { WhatsAppIngestionService } from "./whatsapp-ingestion.service";
import { PrismaService } from "../../common/prisma/prisma.service";
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

describe("WhatsAppIngestionService", () => {
  function buildPrismaMock() {
    return {
      message: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
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
    };
  }

  it("skips a message that was already processed (idempotency)", async () => {
    const prisma = buildPrismaMock();
    prisma.message.findUnique.mockResolvedValue({ id: "msg-1", externalId: "wamid.ABC123" });
    const service = new WhatsAppIngestionService(prisma as unknown as PrismaService);

    await service.ingest(buildJob());

    expect(prisma.whatsAppConnection.findUnique).not.toHaveBeenCalled();
    expect(prisma.lead.create).not.toHaveBeenCalled();
  });

  it("drops the event when the phone_number_id doesn't match any connection", async () => {
    const prisma = buildPrismaMock();
    prisma.whatsAppConnection.findUnique.mockResolvedValue(null);
    const service = new WhatsAppIngestionService(prisma as unknown as PrismaService);

    await service.ingest(buildJob());

    expect(prisma.lead.create).not.toHaveBeenCalled();
    expect(prisma.message.create).not.toHaveBeenCalled();
  });

  it("creates exactly one lead, one conversation, and one message on first contact, with the full timeline", async () => {
    const prisma = buildPrismaMock();
    prisma.lead.create.mockResolvedValue({ id: "lead-1", name: null, lastContactAt: new Date(0) });
    prisma.conversation.create.mockResolvedValue({ id: "conv-1", lastMessageAt: new Date(0) });
    const service = new WhatsAppIngestionService(prisma as unknown as PrismaService);

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
    const service = new WhatsAppIngestionService(prisma as unknown as PrismaService);

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
    const service = new WhatsAppIngestionService(prisma as unknown as PrismaService);

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
    const service = new WhatsAppIngestionService(prisma as unknown as PrismaService);

    await service.ingest(buildJob());

    const eventTypes = prisma.leadEvent.create.mock.calls.map((call) => call[0].data.type);
    expect(eventTypes).not.toContain("MESSAGE_RECEIVED");
    expect(prisma.whatsAppConnection.update).not.toHaveBeenCalled();
  });

  it("records a non-text message as type OTHER with no stored text", async () => {
    const prisma = buildPrismaMock();
    prisma.lead.create.mockResolvedValue({ id: "lead-1", name: null, lastContactAt: new Date(0) });
    prisma.conversation.create.mockResolvedValue({ id: "conv-1", lastMessageAt: new Date(0) });
    const service = new WhatsAppIngestionService(prisma as unknown as PrismaService);

    await service.ingest(buildJob({ type: "other", text: undefined, messageId: "wamid.IMG" }));

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: "OTHER", text: undefined }),
    });
  });
});
