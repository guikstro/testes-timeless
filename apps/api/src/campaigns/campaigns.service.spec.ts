import { CampaignsService } from "./campaigns.service";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";

describe("CampaignsService", () => {
  function buildService() {
    const prisma = {
      campaign: {
        findMany: jest.fn(),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: "c-nova" }),
        delete: jest.fn(),
      },
      adSpend: { upsert: jest.fn() },
    };
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

  describe("campanha manual", () => {
    /*
      A regressão que motivou tornar o `external_id` único por organização.

      Ele era único no sistema inteiro, então o id da campanha virava um espaço
      compartilhado entre clientes sem relação nenhuma: um registrava o id e o
      outro descobria isso pelo conflito, além de ficar impedido de registrar o
      id verdadeiro da própria campanha.
    */
    it("procura o id existente dentro da organização, nunca no sistema inteiro", async () => {
      const { service, prisma } = buildService();

      await service.criarManual("org-1", { name: "Minha campanha", platform: "GOOGLE", externalId: "123" });

      expect(prisma.campaign.findFirst).toHaveBeenCalledWith({
        where: { organizationId: "org-1", externalId: "123" },
      });
    });

    it("deixa duas organizações usarem o mesmo id", async () => {
      const { service, prisma } = buildService();

      await service.criarManual("org-1", { name: "Campanha da A", platform: "GOOGLE", externalId: "123" });
      await service.criarManual("org-2", { name: "Campanha da B", platform: "GOOGLE", externalId: "123" });

      expect(prisma.campaign.create).toHaveBeenCalledTimes(2);
    });

    it("recusa repetir o id dentro da mesma organização", async () => {
      const { service, prisma } = buildService();
      prisma.campaign.findFirst.mockResolvedValue({ id: "ja-existe" });

      await expect(
        service.criarManual("org-1", { name: "Outra", platform: "GOOGLE", externalId: "123" }),
      ).rejects.toThrow("Já existe uma campanha sua com esse id");
      expect(prisma.campaign.create).not.toHaveBeenCalled();
    });

    it("trata a corrida entre a conferência e a criação", async () => {
      const { service, prisma } = buildService();
      prisma.campaign.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
        }),
      );

      // A conferência e a criação não são atômicas: dois envios seguidos do
      // mesmo formulário chegam aqui, e quem manda é a restrição do banco.
      await expect(
        service.criarManual("org-1", { name: "Minha", platform: "GOOGLE", externalId: "123" }),
      ).rejects.toThrow("Já existe uma campanha sua com esse id");
    });

    it("gera um id próprio quando ninguém informa um", async () => {
      const { service, prisma } = buildService();

      await service.criarManual("org-1", { name: "Sem id", platform: "GOOGLE" });

      const dados = prisma.campaign.create.mock.calls[0][0].data as { externalId: string };
      // O id gerado carrega a organização: dois clientes criando no mesmo
      // milissegundo não podem colidir.
      expect(dados.externalId).toContain("org-1");
    });
  });
});
