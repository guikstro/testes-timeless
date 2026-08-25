import { JwtService } from "@nestjs/jwt";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { AuthService } from "./auth.service";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";

// bcrypt's native binding exports non-configurable properties, so
// jest.spyOn(bcrypt, "compare") fails with "Cannot redefine property".
// Wrapping the real implementation in jest.fn() via jest.mock keeps actual
// hashing/comparison behavior (needed by the other tests below) while still
// letting us assert on call counts.
jest.mock("bcrypt", () => {
  const actual = jest.requireActual("bcrypt");
  return { ...actual, compare: jest.fn(actual.compare) };
});

type MockPrisma = {
  user: Record<string, jest.Mock>;
  organization: Record<string, jest.Mock>;
  membership: Record<string, jest.Mock>;
  refreshToken: Record<string, jest.Mock>;
  passwordResetToken: Record<string, jest.Mock>;
  $transaction: jest.Mock;
};

function buildPrismaMock(): MockPrisma {
  const tx = {
    organization: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn() },
    user: { create: jest.fn() },
    membership: { create: jest.fn() },
  };

  return {
    user: { findUnique: jest.fn(), create: jest.fn() },
    organization: { findUnique: jest.fn() },
    membership: { create: jest.fn() },
    refreshToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    passwordResetToken: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === "function") {
        return arg(tx);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
  };
}

describe("AuthService", () => {
  let prisma: MockPrisma;
  let jwt: JwtService;
  let service: AuthService;

  beforeEach(() => {
    prisma = buildPrismaMock();
    jwt = new JwtService({ secret: "test-secret" });
    service = new AuthService(prisma as unknown as PrismaService, jwt);
  });

  describe("register", () => {
    it("creates an organization, a user, and an OWNER membership, then returns tokens", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      prisma.$transaction.mockImplementationOnce(async (callback: (tx: unknown) => unknown) => {
        const txStub = {
          organization: {
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ id: "org-1", slug: "acme" }),
          },
          user: { create: jest.fn().mockResolvedValue({ id: "user-1" }) },
          membership: {
            create: jest.fn().mockResolvedValue({ organizationId: "org-1", userId: "user-1", role: "OWNER" }),
          },
        };
        return callback(txStub);
      });

      const result = await service.register({
        name: "Ana",
        email: "ana@example.com",
        password: "password123",
        organizationName: "Acme",
      });

      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(prisma.refreshToken.create).toHaveBeenCalledTimes(1);
    });

    it("rejects registration when the e-mail is already in use", async () => {
      prisma.user.findUnique.mockResolvedValue({ id: "existing-user" });

      await expect(
        service.register({
          name: "Ana",
          email: "ana@example.com",
          password: "password123",
          organizationName: "Acme",
        }),
      ).rejects.toThrow(AppException);
    });

    it("converts a race-condition unique-constraint violation into a clean 409 instead of a raw 500", async () => {
      // The pre-check (findUnique) and the transaction's create() are not
      // atomic, so two concurrent identical requests can both pass the
      // pre-check and then collide on the DB's unique constraint.
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.$transaction.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
          code: "P2002",
          clientVersion: "test",
        }),
      );

      await expect(
        service.register({
          name: "Ana",
          email: "ana@example.com",
          password: "password123",
          organizationName: "Acme",
        }),
      ).rejects.toMatchObject({ response: { code: "EMAIL_ALREADY_IN_USE" } });
    });
  });

  describe("login", () => {
    it("rejects an unknown e-mail without revealing whether the account exists", async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login({ email: "nobody@example.com", password: "whatever" })).rejects.toMatchObject({
        response: { code: "INVALID_CREDENTIALS" },
      });
    });

    it("still pays the bcrypt cost for an unknown e-mail (no timing side-channel to enumerate accounts)", async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const compareMock = bcrypt.compare as unknown as jest.Mock;
      compareMock.mockClear();

      await expect(service.login({ email: "nobody@example.com", password: "whatever" })).rejects.toBeInstanceOf(
        AppException,
      );

      // Unknown-user and wrong-password paths must do the same amount of
      // work; a short-circuit that skips bcrypt.compare for unknown users
      // makes the two cases distinguishable by response time.
      expect(compareMock).toHaveBeenCalledTimes(1);
    });

    it("rejects a wrong password", async () => {
      const passwordHash = await bcrypt.hash("correct-password", 4);
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash,
        memberships: [{ organizationId: "org-1", role: "OWNER" }],
      });

      await expect(service.login({ email: "ana@example.com", password: "wrong-password" })).rejects.toMatchObject({
        response: { code: "INVALID_CREDENTIALS" },
      });
    });

    it("issues a token pair for correct credentials", async () => {
      const passwordHash = await bcrypt.hash("correct-password", 4);
      prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash,
        memberships: [{ organizationId: "org-1", role: "OWNER" }],
      });

      const result = await service.login({ email: "ana@example.com", password: "correct-password" });
      expect(result.accessToken).toEqual(expect.any(String));

      const payload = jwt.decode(result.accessToken) as { organizationId: string };
      expect(payload.organizationId).toBe("org-1");
    });

    it("rejects a user with no organization membership", async () => {
      const passwordHash = await bcrypt.hash("correct-password", 4);
      prisma.user.findUnique.mockResolvedValue({ id: "user-1", passwordHash, memberships: [] });

      await expect(service.login({ email: "ana@example.com", password: "correct-password" })).rejects.toMatchObject({
        response: { code: "NO_ORGANIZATION" },
      });
    });
  });

  describe("logout / refresh", () => {
    it("rejects reusing a refresh token after it has been revoked", async () => {
      prisma.refreshToken.findUnique.mockResolvedValue(null);

      await expect(service.refresh("some-revoked-token")).rejects.toMatchObject({
        response: { code: "INVALID_REFRESH_TOKEN" },
      });
    });
  });
});
