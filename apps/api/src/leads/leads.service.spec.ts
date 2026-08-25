import { LeadsService } from "./leads.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";

describe("LeadsService", () => {
  function buildService() {
    const prisma = {
      lead: { findMany: jest.fn(), count: jest.fn(), findFirst: jest.fn() },
      leadEvent: { findMany: jest.fn().mockResolvedValue([]) },
      message: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new LeadsService(prisma as unknown as PrismaService);
    return { service, prisma };
  }

  it("scopes the list query to the caller's organization", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findMany.mockResolvedValue([]);
    prisma.lead.count.mockResolvedValue(0);

    await service.list("org-1", { offset: 0, limit: 20 });

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
  });

  it("never resolves a lead belonging to another organization", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findFirst.mockResolvedValue(null);

    await expect(service.findOne("org-1", "lead-from-org-2")).rejects.toThrow(AppException);
    expect(prisma.lead.findFirst).toHaveBeenCalledWith({ where: { id: "lead-from-org-2", organizationId: "org-1" } });
  });

  it("returns the lead's timeline (events) and message transcript together", async () => {
    const { service, prisma } = buildService();
    prisma.lead.findFirst.mockResolvedValue({ id: "lead-1", organizationId: "org-1" });
    prisma.leadEvent.findMany.mockResolvedValue([{ type: "LEAD_CREATED" }]);
    prisma.message.findMany.mockResolvedValue([{ text: "oi" }]);

    const result = await service.findOne("org-1", "lead-1");

    expect(result.events).toEqual([{ type: "LEAD_CREATED" }]);
    expect(result.messages).toEqual([{ text: "oi" }]);
  });
});
