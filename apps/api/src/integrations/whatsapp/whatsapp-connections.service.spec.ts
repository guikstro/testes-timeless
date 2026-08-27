import { Prisma } from "@prisma/client";
import { WhatsAppConnectionsService } from "./whatsapp-connections.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { EvolutionClient } from "./evolution-client";
import { AppException } from "../../common/exceptions/app-exception";

function uniqueConstraintError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
}

describe("WhatsAppConnectionsService", () => {
  function buildService() {
    const prisma = {
      whatsAppConnection: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    };
    const encryption = {
      encrypt: jest.fn((value: string) => `encrypted(${value})`),
      decrypt: jest.fn(),
    };
    const evolution = {
      createInstance: jest.fn(),
      getQrCode: jest.fn().mockResolvedValue({ base64: "data:image/png;base64,QR", code: "code" }),
      getConnectionState: jest.fn().mockResolvedValue("connecting"),
      getConnectedNumber: jest.fn().mockResolvedValue(null),
      sendText: jest.fn(),
      logout: jest.fn(),
      deleteInstance: jest.fn(),
    };
    const service = new WhatsAppConnectionsService(
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
      evolution as unknown as EvolutionClient,
    );
    return { service, prisma, encryption, evolution };
  }

  it("never returns the encrypted access token — only whether one is set", async () => {
    const { service, prisma } = buildService();
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      organizationId: "org-1",
      phoneNumberId: "phone-1",
      accessTokenEncrypted: "iv:tag:ciphertext",
    });

    const result = await service.getCurrent("org-1");

    expect(result).not.toHaveProperty("accessTokenEncrypted");
    expect(result).toMatchObject({ hasAccessToken: true });
  });

  it("encrypts the access token before persisting it", async () => {
    const { service, prisma, encryption } = buildService();
    prisma.whatsAppConnection.findUnique.mockResolvedValue(null);
    prisma.whatsAppConnection.upsert.mockResolvedValue({
      id: "conn-1",
      organizationId: "org-1",
      accessTokenEncrypted: "encrypted(system-user-token)",
    });

    await service.connect("org-1", {
      phoneNumberId: "phone-1",
      displayPhoneNumber: "+55 85 90000-0000",
      accessToken: "system-user-token",
    });

    expect(encryption.encrypt).toHaveBeenCalledWith("system-user-token");
    expect(prisma.whatsAppConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
        create: expect.objectContaining({ accessTokenEncrypted: "encrypted(system-user-token)" }),
      }),
    );
  });

  it("rejects connecting a phone_number_id already claimed by a different organization", async () => {
    const { service, prisma } = buildService();
    prisma.whatsAppConnection.findUnique.mockResolvedValue({ organizationId: "org-OTHER", phoneNumberId: "phone-1" });

    await expect(
      service.connect("org-1", { phoneNumberId: "phone-1", displayPhoneNumber: "+55 85 90000-0000" }),
    ).rejects.toMatchObject({ response: { code: "PHONE_NUMBER_ALREADY_CONNECTED" } });

    expect(prisma.whatsAppConnection.upsert).not.toHaveBeenCalled();
  });

  it("translates a race-condition unique violation on phone_number_id into the same clean conflict", async () => {
    const { service, prisma } = buildService();
    prisma.whatsAppConnection.findUnique.mockResolvedValue(null);
    prisma.whatsAppConnection.upsert.mockRejectedValue(uniqueConstraintError());

    await expect(
      service.connect("org-1", { phoneNumberId: "phone-1", displayPhoneNumber: "+55 85 90000-0000" }),
    ).rejects.toMatchObject({ response: { code: "PHONE_NUMBER_ALREADY_CONNECTED" } });
  });

  it("reconnecting reuses the same connection row (upsert), never creating a second one", async () => {
    const { service, prisma } = buildService();
    prisma.whatsAppConnection.findUnique.mockResolvedValue({ organizationId: "org-1", phoneNumberId: "phone-1" });
    prisma.whatsAppConnection.upsert.mockResolvedValue({ id: "conn-1", organizationId: "org-1" });

    await service.connect("org-1", { phoneNumberId: "phone-1", displayPhoneNumber: "+55 85 90000-0000" });

    expect(prisma.whatsAppConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
  });

  it("disconnect flips status without deleting the connection row", async () => {
    const { service, prisma } = buildService();
    prisma.whatsAppConnection.findUnique.mockResolvedValue({ organizationId: "org-1" });

    await service.disconnect("org-1");

    expect(prisma.whatsAppConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { status: "DISCONNECTED", disconnectedAt: expect.any(Date) },
    });
  });

  it("throws when trying to disconnect an organization with no connection", async () => {
    const { service, prisma } = buildService();
    prisma.whatsAppConnection.findUnique.mockResolvedValue(null);

    await expect(service.disconnect("org-1")).rejects.toThrow(AppException);
  });
});
