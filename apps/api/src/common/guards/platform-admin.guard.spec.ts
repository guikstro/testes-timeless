import { ExecutionContext } from "@nestjs/common";
import { PlatformAdminGuard } from "./platform-admin.guard";
import { PrismaService } from "../prisma/prisma.service";
import { AppException } from "../exceptions/app-exception";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";

describe("PlatformAdminGuard", () => {
  function buildGuard() {
    const prisma = { user: { findUnique: jest.fn() } };
    const guard = new PlatformAdminGuard(prisma as unknown as PrismaService);
    return { guard, prisma };
  }

  function contextFor(user?: Partial<AuthenticatedUser>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
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
    prisma.user.findUnique.mockResolvedValue({ isPlatformAdmin: true, deletedAt: null });

    await expect(guard.canActivate(contextFor(admin))).resolves.toBe(true);
  });

  it("rejects an authenticated user who is not a platform admin", async () => {
    const { guard, prisma } = buildGuard();
    prisma.user.findUnique.mockResolvedValue({ isPlatformAdmin: false, deletedAt: null });

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
    prisma.user.findUnique.mockResolvedValue({ isPlatformAdmin: true, deletedAt: null });

    await guard.canActivate(contextFor(admin));

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: "admin-1" },
      select: { isPlatformAdmin: true, deletedAt: true },
    });
  });

  it("rejects a soft-deleted user even if the flag is still set", async () => {
    const { guard, prisma } = buildGuard();
    prisma.user.findUnique.mockResolvedValue({ isPlatformAdmin: true, deletedAt: new Date() });

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
});
