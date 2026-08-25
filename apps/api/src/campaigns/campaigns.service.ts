import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId },
      include: {
        adSets: { include: { ads: true } },
        spend: { orderBy: { date: "desc" }, take: 30 },
      },
      orderBy: { lastSyncedAt: "desc" },
    });

    return campaigns.map((campaign) => ({
      ...campaign,
      totalSpendCents: campaign.spend.reduce((sum, row) => sum + row.spendCents, 0),
    }));
  }
}
