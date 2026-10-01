import { PaginaSyncService } from "./pagina-sync.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { MetaGraphClient } from "../../integrations/meta/meta-graph-client";
import { MetaApiError } from "../../integrations/meta/meta-api-error";
import { hojeLocal } from "../../common/tempo";

const somaDias = (dia: string, dias: number) =>
  new Date(Date.parse(`${dia}T12:00:00.000Z`) + dias * 86_400_000).toISOString().slice(0, 10);

describe("PaginaSyncService", () => {
  function montar(conexao: Record<string, unknown> | null = { paginaId: "226094994111312", status: "CONNECTED", accessTokenEncrypted: "cifrado" }) {
    const prisma = {
      metaConnection: {
        findUnique: jest.fn().mockResolvedValue(conexao),
        update: jest.fn().mockResolvedValue(undefined),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const encryption = { decrypt: jest.fn().mockReturnValue("token-do-sistema") };
    const cliente = {
      getPagina: jest.fn().mockResolvedValue({ id: "226094994111312", name: "Ótica Exemplo", access_token: "token-da-pagina" }),
      getInsightsDaPagina: jest.fn().mockResolvedValue([
        { name: "page_media_view", period: "day", values: [{ value: 1200, end_time: "2026-09-02T07:00:00+0000" }] },
      ]),
    };
    const servico = new PaginaSyncService(
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
      cliente as unknown as MetaGraphClient,
    );
    return { servico, prisma, cliente };
  }

  it("não faz nada sem Página escolhida, ou com a Meta desligada", async () => {
    const semPagina = montar({ paginaId: null, status: "CONNECTED", accessTokenEncrypted: "x" });
    await semPagina.servico.sincroniza("org-1");
    expect(semPagina.cliente.getPagina).not.toHaveBeenCalled();

    const desligada = montar({ paginaId: "1", status: "DISCONNECTED", accessTokenEncrypted: "x" });
    await desligada.servico.sincroniza("org-1");
    expect(desligada.cliente.getPagina).not.toHaveBeenCalled();
  });

  it("lê os últimos dias com o token da Página, guarda e marca a leitura", async () => {
    const { servico, prisma, cliente } = montar();
    const hoje = hojeLocal();

    await servico.sincroniza("org-1");

    expect(cliente.getPagina).toHaveBeenCalledWith("226094994111312", "token-do-sistema");
    expect(cliente.getInsightsDaPagina).toHaveBeenCalledWith(
      "226094994111312",
      "token-da-pagina",
      expect.arrayContaining(["page_media_view", "page_daily_follows_unique", "page_follows"]),
      "day",
      somaDias(hoje, -3),
      somaDias(hoje, 1),
    );
    // Os visualizadores únicos, em 7 e em 28 dias.
    expect(cliente.getInsightsDaPagina).toHaveBeenCalledWith(
      "226094994111312", "token-da-pagina", ["page_total_media_view_unique"], "week", expect.any(String), expect.any(String),
    );
    expect(cliente.getInsightsDaPagina).toHaveBeenCalledWith(
      "226094994111312", "token-da-pagina", ["page_total_media_view_unique"], "days_28", expect.any(String), expect.any(String),
    );
    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { paginaNome: "Ótica Exemplo", paginaSincronizadaEm: expect.any(Date), paginaErro: null },
    });
  });

  it("ao escolher a Página, lê o histórico que cabe numa chamada da Meta", async () => {
    const { servico, cliente } = montar();
    await servico.sincroniza("org-1", 400);
    expect(cliente.getInsightsDaPagina.mock.calls[0][4]).toBe(somaDias(hojeLocal(), -89));
  });

  it("sem o acesso à Página, diz onde ela precisa estar, sem lançar", async () => {
    const { servico, prisma, cliente } = montar();
    cliente.getPagina.mockResolvedValue({ id: "226094994111312", name: "Ótica" });

    await expect(servico.sincroniza("org-1")).resolves.toBeUndefined();

    expect(cliente.getInsightsDaPagina).not.toHaveBeenCalled();
    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { paginaErro: expect.stringContaining("ativos do usuário do sistema") },
    });
  });

  /*
    A Meta aposenta métricas sem aviso, e um nome recusado derruba a chamada
    inteira. Uma métrica aposentada não pode apagar as outras da tela.
  */
  it("pede uma a uma quando a Meta recusa um nome, e guarda as que vierem", async () => {
    const { servico, prisma, cliente } = montar();
    cliente.getInsightsDaPagina.mockImplementation(async (_p: string, _t: string, metricas: string[]) => {
      if (metricas.length > 1 || metricas[0] === "page_video_view_time") {
        throw new MetaApiError(100, undefined, "(#100) The value must be a valid insights metric");
      }
      return [{ name: metricas[0], period: "day", values: [{ value: 5, end_time: "2026-09-02T07:00:00+0000" }] }];
    });

    await servico.sincroniza("org-1");

    expect(prisma.$executeRaw).toHaveBeenCalled();
    expect(prisma.metaConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paginaErro: null }) }),
    );
  });

  it("limite da Meta fica escrito na tela, sem lançar", async () => {
    const { servico, prisma, cliente } = montar();
    cliente.getPagina.mockRejectedValue(new MetaApiError(32, undefined, "Page request limit reached"));

    await expect(servico.sincroniza("org-1")).resolves.toBeUndefined();
    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { paginaErro: expect.stringContaining("limitou as leituras da Página") },
    });
  });

  it("erro de rede volta ao BullMQ para tentar de novo, com o motivo na tela", async () => {
    const { servico, prisma, cliente } = montar();
    cliente.getPagina.mockRejectedValue(new TypeError("fetch failed"));

    await expect(servico.sincroniza("org-1")).rejects.toThrow("fetch failed");
    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { paginaErro: "fetch failed" },
    });
  });
});
