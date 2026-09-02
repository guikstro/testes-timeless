import { AnalyticsService } from "./analytics.service";
import { PrismaService } from "../common/prisma/prisma.service";

describe("AnalyticsService", () => {
  function buildService() {
    const prisma = {
      lead: { findMany: jest.fn().mockResolvedValue([]) },
      whatsAppConnection: { findUnique: jest.fn().mockResolvedValue(null) },
      metaConnection: { findUnique: jest.fn().mockResolvedValue(null) },
      trackingLink: { count: jest.fn().mockResolvedValue(0) },
    };
    return { service: new AnalyticsService(prisma as unknown as PrismaService), prisma };
  }

  it("escopa a consulta à organização de quem pediu", async () => {
    const { service, prisma } = buildService();

    await service.overview("org-1", 30);

    expect(prisma.lead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: "org-1" }) }),
    );
  });

  it("monta a janela contando o dia de hoje", async () => {
    const { service, prisma } = buildService();

    const result = await service.overview("org-1", 7);

    const from = new Date(result.period.from);
    const to = new Date(result.period.to);

    // Compara DATAS, não milissegundos: `to` é o instante atual, então à noite
    // a diferença em milissegundos passa de 6,5 dias e arredondava para 7,
    // fazendo o teste falhar conforme a hora em que rodasse.
    const soData = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diasDeCalendario = Math.round((soData(to) - soData(from)) / 86_400_000);

    // 7 dias incluindo hoje são 6 dias completos para trás.
    expect(diasDeCalendario).toBe(6);
    expect(from.getHours()).toBe(0);
  });

  /**
   * Sem estes sinais a tela mostra "origem desconhecida: 100%" sem conseguir
   * dizer o que fazer a respeito.
   */
  it("informa o que ainda não foi conectado", async () => {
    const { service, prisma } = buildService();
    prisma.whatsAppConnection.findUnique.mockResolvedValue({ status: "CONNECTED" });
    prisma.metaConnection.findUnique.mockResolvedValue({ status: "DISCONNECTED" });
    prisma.trackingLink.count.mockResolvedValue(3);

    const result = await service.overview("org-1", 30);

    expect(result.setup).toEqual({
      whatsappConnected: true,
      metaConnected: false,
      trackingLinkCount: 3,
    });
  });

  it("trata a ausência de conexão como não conectado, sem quebrar", async () => {
    const { service } = buildService();

    const result = await service.overview("org-1", 30);

    expect(result.setup.whatsappConnected).toBe(false);
    expect(result.setup.metaConnected).toBe(false);
  });

  it("não conta links removidos", async () => {
    const { service, prisma } = buildService();

    await service.overview("org-1", 30);

    expect(prisma.trackingLink.count).toHaveBeenCalledWith({
      where: { organizationId: "org-1", deletedAt: null },
    });
  });

  it("devolve um período vazio coerente quando não há lead nenhum", async () => {
    const { service } = buildService();

    const result = await service.overview("org-1", 30);

    expect(result.totals.leads).toBe(0);
    expect(result.totals.qualificationRate).toBeNull();
    expect(result.byOrigin).toEqual([]);
    // A série existe mesmo vazia, para o gráfico ter eixo.
    expect(result.daily).toHaveLength(30);
  });
})

describe("AnalyticsService.desempenhoPorCampanha", () => {
  function buildService(campanhas: unknown[] = [], leads: unknown[] = []) {
    const prisma = {
      campaign: { findMany: jest.fn().mockResolvedValue(campanhas) },
      lead: { findMany: jest.fn().mockResolvedValue(leads) },
    };
    return { service: new AnalyticsService(prisma as unknown as PrismaService), prisma };
  }

  const marco = { de: "2026-03-01", ate: "2026-03-31" };

  it("consulta as duas janelas quando há comparação, e só uma quando não há", async () => {
    const semComparacao = buildService();
    await semComparacao.service.desempenhoPorCampanha("org-1", marco, null);
    expect(semComparacao.prisma.lead.findMany).toHaveBeenCalledTimes(1);

    const comComparacao = buildService();
    await comComparacao.service.desempenhoPorCampanha("org-1", marco, { de: "2026-07-01", ate: "2026-07-31" });
    expect(comComparacao.prisma.lead.findMany).toHaveBeenCalledTimes(2);
  });

  it("monta a janela do lead no horário de Brasília e a do gasto em UTC", async () => {
    const { service, prisma } = buildService();

    await service.desempenhoPorCampanha("org-1", marco, null);

    const where = prisma.lead.findMany.mock.calls[0][0].where;
    expect(where.organizationId).toBe("org-1");
    // Meia-noite em Brasília são três da manhã em UTC. Sem este deslocamento,
    // o lead que chegou às 22h do dia 31 entraria no mês seguinte.
    expect(where.firstContactAt.gte.toISOString()).toBe("2026-03-01T03:00:00.000Z");
    expect(where.firstContactAt.lte.toISOString()).toBe("2026-04-01T02:59:59.999Z");

    // O gasto não é instante, é dia civil gravado na meia-noite UTC: a janela
    // dele acompanha esse eixo, ou nenhuma linha casaria.
    const gasto = prisma.campaign.findMany.mock.calls[0][0].select.spend.where.date;
    expect(gasto.gte.toISOString()).toBe("2026-03-01T00:00:00.000Z");
    expect(gasto.lte.toISOString()).toBe("2026-03-31T00:00:00.000Z");
  });

  it("cruza o lead com a campanha pelo id externo do clique", async () => {
    const { service } = buildService(
      [
        {
          id: "c1",
          externalId: "ext-1",
          name: "Institucional",
          platform: "GOOGLE",
          spend: [{ date: new Date("2026-03-02T00:00:00.000Z"), spendCents: 20000 }],
        },
      ],
      [
        {
          qualifiedAt: new Date("2026-03-03T10:00:00.000Z"),
          wonAt: new Date("2026-03-05T10:00:00.000Z"),
          sale: { amountCents: 90000 },
          attribution: { evidence: null, trackingClick: { campaignId: "ext-1", adsetId: null, adId: null } },
        },
        // Sem atribuição nenhuma: entra na contagem à parte, não numa campanha.
        { qualifiedAt: null, wonAt: null, sale: null, attribution: null },
      ],
    );

    const resultado = await service.desempenhoPorCampanha("org-1", marco, null);

    expect(resultado.campanhas).toHaveLength(1);
    expect(resultado.campanhas[0].atual).toMatchObject({
      nome: "Institucional",
      gastoCentavos: 20000,
      leads: 1,
      vendas: 1,
      receitaCentavos: 90000,
      custoPorLeadCentavos: 20000,
      roas: 4.5,
    });
    expect(resultado.semCampanha).toEqual({ atual: 1, anterior: 0 });
    expect(resultado.totais).toEqual({ gastoCentavos: 20000, leads: 1, vendas: 1, receitaCentavos: 90000 });
  });

  it("aceita o id da campanha vindo só da evidência, como no clique para WhatsApp", async () => {
    const { service } = buildService(
      [{ id: "c1", externalId: "ext-9", name: "CTWA", platform: "META", spend: [] }],
      [{ qualifiedAt: null, wonAt: null, sale: null, attribution: { evidence: { campaignId: "ext-9" }, trackingClick: null } }],
    );

    const resultado = await service.desempenhoPorCampanha("org-1", marco, null);

    expect(resultado.campanhas[0].atual!.leads).toBe(1);
  });

  it("deixa de fora a campanha que não teve gasto nem lead na janela", async () => {
    const { service } = buildService(
      [
        { id: "c1", externalId: "ext-1", name: "Parada", platform: "GOOGLE", spend: [] },
        {
          id: "c2",
          externalId: "ext-2",
          name: "Ativa",
          platform: "GOOGLE",
          spend: [{ date: new Date("2026-03-02T00:00:00.000Z"), spendCents: 100 }],
        },
      ],
      [],
    );

    const resultado = await service.desempenhoPorCampanha("org-1", marco, null);

    expect(resultado.campanhas.map((linha) => linha.nome)).toEqual(["Ativa"]);
  });
});
