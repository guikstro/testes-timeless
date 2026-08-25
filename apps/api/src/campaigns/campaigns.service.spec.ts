import { CampaignsService } from "./campaigns.service";
import { PrismaService } from "../common/prisma/prisma.service";

describe("CampaignsService", () => {
  function buildService() {
    const prisma = { campaign: { findMany: jest.fn() } };
    const service = new CampaignsService(prisma as unknown as PrismaService);
    return { service, prisma };
  }

  it("scopes the query to the caller's organization", async () => {
    const { service, prisma } = buildService();
    prisma.campaign.findMany.mockResolvedValue([]);

    await service.list("org-1");

    expect(prisma.campaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
  });

  it("sums the recent spend rows into totalSpendCents per campaign", async () => {
    const { service, prisma } = buildService();
    prisma.campaign.findMany.mockResolvedValue([
      {
        id: "c1",
        name: "Direito Trabalhista",
        adSets: [],
        spend: [{ spendCents: 10000 }, { spendCents: 5000 }],
      },
    ]);

    const result = await service.list("org-1");

    expect(result[0].totalSpendCents).toBe(15000);
  });
});
