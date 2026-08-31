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
    // 7 dias incluindo hoje são 6 dias completos para trás.
    const diffDays = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    expect(diffDays).toBe(6);
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
