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

  describe("investimentoNoPeriodo", () => {
    it("pede à base só os gastos dentro da janela pedida", async () => {
      const { service, prisma } = buildService();
      prisma.campaign.findMany.mockResolvedValue([]);

      await service.investimentoNoPeriodo("org-1", 30);

      const argumentos = prisma.campaign.findMany.mock.calls[0][0];
      const janela = argumentos.select.spend.where.date;
      const dias = Math.round((janela.lte.getTime() - janela.gte.getTime()) / 86_400_000);

      // Trinta dias contados de ponta a ponta são vinte e nove intervalos.
      expect(dias).toBe(29);
      expect(argumentos.where).toEqual({ organizationId: "org-1" });
    });

    it("soma o gasto e conta os dias em que houve gasto", async () => {
      const { service, prisma } = buildService();
      prisma.campaign.findMany.mockResolvedValue([
        {
          id: "c1",
          name: "Institucional",
          platform: "GOOGLE",
          spend: [{ spendCents: 3000 }, { spendCents: 4500 }],
        },
        { id: "c2", name: "Parada", platform: "META", spend: [] },
      ]);

      const resultado = await service.investimentoNoPeriodo("org-1", 30);

      expect(resultado[0]).toEqual({
        id: "c1",
        name: "Institucional",
        platform: "GOOGLE",
        diasComGasto: 2,
        totalCents: 7500,
      });
      // Campanha sem gasto volta zerada em vez de sumir: quem decide se ela
      // entra no relatório é a tela, não a consulta.
      expect(resultado[1].totalCents).toBe(0);
    });
  });
});
