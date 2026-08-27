import { AdminService } from "./admin.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { AppException } from "../common/exceptions/app-exception";

describe("AdminService", () => {
  function buildService() {
    const prisma = {
      organization: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), findFirst: jest.fn() },
      sale: { groupBy: jest.fn().mockResolvedValue([]) },
      auditLog: { create: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
      user: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const auth = {
      issueTokenPair: jest.fn().mockResolvedValue({ accessToken: "access", refreshToken: "refresh" }),
    };
    const service = new AdminService(prisma as unknown as PrismaService, auth as unknown as AuthService);
    return { service, prisma, auth };
  }

  describe("listOrganizations", () => {
    it("excludes soft-deleted organizations", async () => {
      const { service, prisma } = buildService();

      await service.listOrganizations({ offset: 0, limit: 20 });

      expect(prisma.organization.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) }),
      );
    });

    it("filters by name or slug when a search term is given", async () => {
      const { service, prisma } = buildService();

      await service.listOrganizations({ offset: 0, limit: 20 }, "  direito  ");

      const where = prisma.organization.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { name: { contains: "direito", mode: "insensitive" } },
        { slug: { contains: "direito", mode: "insensitive" } },
      ]);
    });

    it("ignores a blank search term instead of filtering on an empty string", async () => {
      const { service, prisma } = buildService();

      await service.listOrganizations({ offset: 0, limit: 20 }, "   ");

      expect(prisma.organization.findMany.mock.calls[0][0].where.OR).toBeUndefined();
    });

    /** Uma agregação só para a página inteira, não uma consulta por linha (Seção 75). */
    it("aggregates sales for the whole page in a single grouped query", async () => {
      const { service, prisma } = buildService();
      prisma.organization.findMany.mockResolvedValue([
        { id: "org-1", memberships: [], _count: { leads: 3, memberships: 1 } },
        { id: "org-2", memberships: [], _count: { leads: 0, memberships: 2 } },
      ]);
      prisma.sale.groupBy.mockResolvedValue([
        { organizationId: "org-1", _count: { _all: 2 }, _sum: { amountCents: 250000 } },
      ]);

      const result = await service.listOrganizations({ offset: 0, limit: 20 });

      expect(prisma.sale.groupBy).toHaveBeenCalledTimes(1);
      expect(prisma.sale.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({ where: { organizationId: { in: ["org-1", "org-2"] }, deletedAt: null } }),
      );
      expect(result.items[0]).toMatchObject({ leadCount: 3, saleCount: 2, revenueCents: 250000 });
      // Sem vendas significa zero, nunca null/undefined na tela.
      expect(result.items[1]).toMatchObject({ saleCount: 0, revenueCents: 0 });
    });
  });

  describe("impersonate", () => {
    it("refuses an organization that does not exist", async () => {
      const { service, prisma, auth } = buildService();
      prisma.organization.findFirst.mockResolvedValue(null);

      await expect(service.impersonate("admin-1", "org-x")).rejects.toThrow(AppException);
      expect(auth.issueTokenPair).not.toHaveBeenCalled();
    });

    it("issues a token for the target organization that stays attributed to the real operator", async () => {
      const { service, prisma, auth } = buildService();
      prisma.organization.findFirst.mockResolvedValue({ id: "org-1", name: "Cliente A" });

      const result = await service.impersonate("admin-1", "org-1");

      // sub = operador (não alguém do cliente), org = alvo, com prazo.
      expect(auth.issueTokenPair).toHaveBeenCalledWith(
        "admin-1",
        "org-1",
        "OWNER",
        { expiresAt: expect.any(Number) },
      );
      expect(result).toMatchObject({
        accessToken: "access",
        organization: { id: "org-1", name: "Cliente A" },
      });
    });

    it("caps the visit at 30 minutes from now", async () => {
      const { service, prisma, auth } = buildService();
      prisma.organization.findFirst.mockResolvedValue({ id: "org-1", name: "Cliente A" });

      const before = Math.floor(Date.now() / 1000);
      const result = await service.impersonate("admin-1", "org-1");

      const { expiresAt } = auth.issueTokenPair.mock.calls[0][3];
      expect(expiresAt).toBeGreaterThanOrEqual(before + 30 * 60);
      expect(expiresAt).toBeLessThanOrEqual(before + 30 * 60 + 5);
      // Devolvido também para a UI poder avisar antes de expirar.
      expect(result.expiresAt).toBe(expiresAt);
    });

    it("records the access in the audit log", async () => {
      const { service, prisma } = buildService();
      prisma.organization.findFirst.mockResolvedValue({ id: "org-1", name: "Cliente A" });

      await service.impersonate("admin-1", "org-1");

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId: "org-1",
          userId: "admin-1",
          action: "IMPERSONATION_STARTED",
        }),
      });
    });

    /**
     * Um acesso sem rastro é pior que um acesso negado: se a auditoria não
     * puder ser gravada, o token não deve ser emitido.
     */
    it("does not issue a token when the audit record cannot be written", async () => {
      const { service, prisma, auth } = buildService();
      prisma.organization.findFirst.mockResolvedValue({ id: "org-1", name: "Cliente A" });
      prisma.auditLog.create.mockRejectedValue(new Error("db down"));

      await expect(service.impersonate("admin-1", "org-1")).rejects.toThrow("db down");
      expect(auth.issueTokenPair).not.toHaveBeenCalled();
    });
  });

  describe("gestão de operadores", () => {
    it("recusa promover um e-mail sem conta — promover não cria usuário", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.upsertOperator("admin-1", { email: "ninguem@x.com", role: "SUPPORT" }),
      ).rejects.toMatchObject({ response: { code: "USER_NOT_FOUND" } });
    });

    it("recusa promover um usuário já removido", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: "u-1", platformRole: null, deletedAt: new Date() });

      await expect(
        service.upsertOperator("admin-1", { email: "removido@x.com", role: "SUPPORT" }),
      ).rejects.toMatchObject({ response: { code: "USER_NOT_FOUND" } });
    });

    it("normaliza o e-mail antes de procurar", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: "u-1", platformRole: null, deletedAt: null });
      prisma.user.update.mockResolvedValue({ id: "u-1", platformRole: "SUPPORT" });

      await service.upsertOperator("admin-1", { email: "  Pessoa@Empresa.COM ", role: "SUPPORT" });

      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { email: "pessoa@empresa.com" } }),
      );
    });

    it("impede que um administrador rebaixe a si mesmo", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: "admin-1", platformRole: "ADMIN", deletedAt: null });

      await expect(
        service.upsertOperator("admin-1", { email: "eu@x.com", role: "SUPPORT" }),
      ).rejects.toMatchObject({ response: { code: "CANNOT_DEMOTE_SELF" } });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it("impede que um administrador revogue a si mesmo", async () => {
      const { service, prisma } = buildService();

      await expect(service.revokeOperator("admin-1", "admin-1")).rejects.toMatchObject({
        response: { code: "CANNOT_REVOKE_SELF" },
      });
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    /**
     * Ficar sem nenhum ADMIN trancaria todo mundo para fora da gestão de
     * operadores — só um acesso direto ao banco resolveria.
     */
    it("impede rebaixar o último administrador", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: "outro", platformRole: "ADMIN", deletedAt: null });
      prisma.user.count.mockResolvedValue(0);

      await expect(
        service.upsertOperator("admin-1", { email: "outro@x.com", role: "SUPPORT" }),
      ).rejects.toMatchObject({ response: { code: "LAST_ADMIN" } });
    });

    it("impede revogar o último administrador", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: "outro", platformRole: "ADMIN" });
      prisma.user.count.mockResolvedValue(0);

      await expect(service.revokeOperator("admin-1", "outro")).rejects.toMatchObject({
        response: { code: "LAST_ADMIN" },
      });
    });

    it("permite rebaixar um administrador quando existe outro", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: "outro", platformRole: "ADMIN", deletedAt: null });
      prisma.user.count.mockResolvedValue(1);
      prisma.user.update.mockResolvedValue({ id: "outro", platformRole: "SUPPORT" });

      await expect(
        service.upsertOperator("admin-1", { email: "outro@x.com", role: "SUPPORT" }),
      ).resolves.toMatchObject({ platformRole: "SUPPORT" });
    });

    it("não checa 'último admin' ao mexer em quem não é admin", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: "u-1", platformRole: "SUPPORT", deletedAt: null });
      prisma.user.update.mockResolvedValue({ id: "u-1", platformRole: "ADMIN" });

      await service.upsertOperator("admin-1", { email: "u1@x.com", role: "ADMIN" });

      expect(prisma.user.count).not.toHaveBeenCalled();
    });

    it("revogar zera o nível sem apagar a conta", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: "u-1", platformRole: "SUPPORT" });

      await service.revokeOperator("admin-1", "u-1");

      // Só zera o nível: a linha do usuário permanece, então ele volta a ser
      // um cliente comum em vez de sumir do sistema.
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: "u-1" },
        data: { platformRole: null },
      });
    });

    it("recusa revogar quem não é operador", async () => {
      const { service, prisma } = buildService();
      prisma.user.findUnique.mockResolvedValue({ id: "u-1", platformRole: null });

      await expect(service.revokeOperator("admin-1", "u-1")).rejects.toMatchObject({
        response: { code: "NOT_FOUND" },
      });
    });

    it("lista apenas operadores ativos", async () => {
      const { service, prisma } = buildService();
      prisma.user.findMany.mockResolvedValue([]);

      await service.listOperators();

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { platformRole: { not: null }, deletedAt: null } }),
      );
    });
  });

  describe("listImpersonations", () => {
    it("returns only impersonation entries, newest first", async () => {
      const { service, prisma } = buildService();

      await service.listImpersonations({ offset: 0, limit: 20 });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { action: "IMPERSONATION_STARTED" },
          orderBy: { createdAt: "desc" },
        }),
      );
    });
  });
});
