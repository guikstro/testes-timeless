import { ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PlatformRole } from "@prisma/client";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PrismaService } from "../prisma/prisma.service";
import { AppException } from "../exceptions/app-exception";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";

describe("PlatformAdminGuard", () => {
  /** `requiredRole` simula o que `@RequiresPlatformRole` teria posto na rota. */
  function buildGuard(requiredRole?: PlatformRole) {
    const prisma = { user: { findUnique: jest.fn() } };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(requiredRole) };
    const guard = new PlatformAdminGuard(
      prisma as unknown as PrismaService,
      reflector as unknown as Reflector,
    );
    return { guard, prisma, reflector };
  }

  function contextFor(user?: Partial<AuthenticatedUser>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    } as unknown as ExecutionContext;
  }

  const admin: AuthenticatedUser = {
    userId: "admin-1",
    organizationId: "org-1",
    role: "OWNER",
    impersonating: false,
  };

  it("allows a platform admin through", async () => {
    const { guard, prisma } = buildGuard();
    prisma.user.findUnique.mockResolvedValue({ platformRole: "ADMIN", deletedAt: null });

    await expect(guard.canActivate(contextFor(admin))).resolves.toBe(true);
  });

  it("rejects an authenticated user who is not a platform admin", async () => {
    const { guard, prisma } = buildGuard();
    prisma.user.findUnique.mockResolvedValue({ platformRole: null, deletedAt: null });

    await expect(guard.canActivate(contextFor(admin))).rejects.toThrow(AppException);
  });

  it("rejects a request with no authenticated user at all", async () => {
    const { guard, prisma } = buildGuard();

    await expect(guard.canActivate(contextFor(undefined))).rejects.toThrow(AppException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  /**
   * Revogar o acesso de um operador precisa valer na hora. Se a flag viesse
   * do JWT, ele continuaria entrando em qualquer cliente até o token expirar.
   */
  it("reads the flag from the database on every request, never from the token", async () => {
    const { guard, prisma } = buildGuard();
    prisma.user.findUnique.mockResolvedValue({ platformRole: "ADMIN", deletedAt: null });

    await guard.canActivate(contextFor(admin));

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { platformRole: true, deletedAt: true },
    });
  });

  it("rejects a soft-deleted user even if the flag is still set", async () => {
    const { guard, prisma } = buildGuard();
    prisma.user.findUnique.mockResolvedValue({ platformRole: "ADMIN", deletedAt: new Date() });

    await expect(guard.canActivate(contextFor(admin))).rejects.toThrow(AppException);
  });

  it("rejects a user row that no longer exists", async () => {
    const { guard, prisma } = buildGuard();
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(guard.canActivate(contextFor(admin))).rejects.toThrow(AppException);
  });

  /**
   * Impede encadear impersonações: de dentro de um cliente não se enxerga
   * nem se entra em outro, o que mantém "quem está onde" sempre legível.
   */
  it("rejects a session that is already impersonating, before even hitting the database", async () => {
    const { guard, prisma } = buildGuard();

    await expect(guard.canActivate(contextFor({ ...admin, impersonating: true }))).rejects.toMatchObject({
      response: { code: "ALREADY_IMPERSONATING" },
    });
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  describe("níveis (Fase 9.2)", () => {
    /**
     * Sem decorator, a rota exige o nível MENOS privilegiado. Esquecer o
     * decorator nunca abre uma rota por acidente — no máximo deixa passar um
     * SUPPORT onde só ADMIN deveria entrar, e por isso as rotas sensíveis o
     * declaram explicitamente.
     */
    it("accepts any operator on a route with no required level", async () => {
      const { guard, prisma } = buildGuard(undefined);
      prisma.user.findUnique.mockResolvedValue({ platformRole: "SUPPORT", deletedAt: null });

      await expect(guard.canActivate(contextFor(admin))).resolves.toBe(true);
    });

    it("rejects a SUPPORT operator on a route that requires ADMIN", async () => {
      const { guard, prisma } = buildGuard("ADMIN");
      prisma.user.findUnique.mockResolvedValue({ platformRole: "SUPPORT", deletedAt: null });

      await expect(guard.canActivate(contextFor(admin))).rejects.toMatchObject({
        response: { code: "INSUFFICIENT_PLATFORM_ROLE" },
      });
    });

    it("accepts an ADMIN on a route that requires ADMIN", async () => {
      const { guard, prisma } = buildGuard("ADMIN");
      prisma.user.findUnique.mockResolvedValue({ platformRole: "ADMIN", deletedAt: null });

      await expect(guard.canActivate(contextFor(admin))).resolves.toBe(true);
    });

    /** Os níveis são hierárquicos: tudo que o SUPPORT faz, o ADMIN também faz. */
    it("accepts an ADMIN on a route that only requires SUPPORT", async () => {
      const { guard, prisma } = buildGuard("SUPPORT");
      prisma.user.findUnique.mockResolvedValue({ platformRole: "ADMIN", deletedAt: null });

      await expect(guard.canActivate(contextFor(admin))).resolves.toBe(true);
    });

    it("exposes the level on the request so the controller does not query again", async () => {
      const { guard, prisma } = buildGuard();
      prisma.user.findUnique.mockResolvedValue({ platformRole: "SUPPORT", deletedAt: null });
      const user = { ...admin };

      await guard.canActivate(contextFor(user));

      expect(user.platformRole).toBe("SUPPORT");
    });
  });
});
