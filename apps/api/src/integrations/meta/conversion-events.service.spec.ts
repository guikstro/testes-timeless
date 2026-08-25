import { Prisma } from "@prisma/client";
import { ConversionEventsService } from "./conversion-events.service";
import { PrismaService } from "../../common/prisma/prisma.service";

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

describe("ConversionEventsService", () => {
  function buildService() {
    const prisma = {
      metaConnection: { findUnique: jest.fn() },
      conversionEvent: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
      organization: { findUniqueOrThrow: jest.fn().mockResolvedValue({ id: "org-1", currency: "BRL" }) },
    };
    const queue = { add: jest.fn() };
    const service = new ConversionEventsService(prisma as unknown as PrismaService, queue as never);
    return { service, prisma, queue };
  }

  describe("recording", () => {
    it("does nothing for an organization that never connected Meta Ads/CAPI", async () => {
      const { service, prisma, queue } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue(null);

      await service.recordLead("org-1", "lead-1", new Date());

      expect(prisma.conversionEvent.create).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it("creates a PENDING row and enqueues a send job for a LEAD event", async () => {
      const { service, prisma, queue } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1" });
      prisma.conversionEvent.create.mockResolvedValue({ id: "event-1" });
      const occurredAt = new Date("2026-01-01T00:00:00Z");

      await service.recordLead("org-1", "lead-1", occurredAt);

      expect(prisma.conversionEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId: "org-1",
          leadId: "lead-1",
          type: "LEAD",
          valueCents: null,
          currency: null,
          occurredAt,
        },
      });
      expect(queue.add).toHaveBeenCalledWith(
        "send",
        { conversionEventId: "event-1" },
        expect.objectContaining({ attempts: 5 }),
      );
    });

    it("looks up the organization's currency only for a PURCHASE event", async () => {
      const { service, prisma } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1" });
      prisma.conversionEvent.create.mockResolvedValue({ id: "event-1" });

      await service.recordPurchase("org-1", "lead-1", new Date(), 200000);

      expect(prisma.organization.findUniqueOrThrow).toHaveBeenCalledWith({ where: { id: "org-1" } });
      expect(prisma.conversionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ type: "PURCHASE", valueCents: 200000, currency: "BRL" }),
      });
    });

    it("never looks up currency for a LEAD or QUALIFIED_LEAD event", async () => {
      const { service, prisma } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1" });
      prisma.conversionEvent.create.mockResolvedValue({ id: "event-1" });

      await service.recordQualifiedLead("org-1", "lead-1", new Date());

      expect(prisma.organization.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("is idempotent — a duplicate (leadId, type) is silently ignored, never re-enqueued", async () => {
      const { service, prisma, queue } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1" });
      prisma.conversionEvent.create.mockRejectedValue(uniqueConstraintError());

      await expect(service.recordLead("org-1", "lead-1", new Date())).resolves.not.toThrow();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it("propagates an unexpected database error instead of swallowing it", async () => {
      const { service, prisma } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1" });
      prisma.conversionEvent.create.mockRejectedValue(new Error("connection reset"));

      await expect(service.recordLead("org-1", "lead-1", new Date())).rejects.toThrow("connection reset");
    });
  });

  describe("drainPending", () => {
    it("re-enqueues every PENDING and FAILED event, but never SENT or RETRYING ones", async () => {
      const { service, prisma, queue } = buildService();
      prisma.conversionEvent.findMany.mockResolvedValue([{ id: "event-1" }, { id: "event-2" }]);

      await service.drainPending("org-1");

      expect(prisma.conversionEvent.findMany).toHaveBeenCalledWith({
        where: { organizationId: "org-1", status: { in: ["PENDING", "FAILED"] } },
        select: { id: true },
      });
      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledWith("send", { conversionEventId: "event-1" }, expect.any(Object));
      expect(queue.add).toHaveBeenCalledWith("send", { conversionEventId: "event-2" }, expect.any(Object));
    });
  });

  describe("list", () => {
    it("scopes to the organization and paginates", async () => {
      const { service, prisma } = buildService();
      prisma.conversionEvent.findMany.mockResolvedValue([]);
      prisma.conversionEvent.count.mockResolvedValue(0);

      await service.list("org-1", { offset: 0, limit: 20 });

      expect(prisma.conversionEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: "org-1" }, skip: 0, take: 20 }),
      );
    });
  });
});
