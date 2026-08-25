import { Queue } from "bullmq";
import { MetaConnectionsService } from "./meta-connections.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { ConversionEventsService } from "./conversion-events.service";
import { AppException } from "../../common/exceptions/app-exception";

describe("MetaConnectionsService", () => {
  function buildService() {
    const prisma = {
      metaConnection: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
    };
    const encryption = { encrypt: jest.fn((value: string) => `encrypted(${value})`) };
    const conversionEvents = { drainPending: jest.fn() };
    const queue = { add: jest.fn() };
    const service = new MetaConnectionsService(
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
      conversionEvents as unknown as ConversionEventsService,
      queue as unknown as Queue,
    );
    return { service, prisma, encryption, conversionEvents, queue };
  }

  it("never returns the encrypted access token or capi token", async () => {
    const { service, prisma } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      organizationId: "org-1",
      adAccountId: "act_123",
      accessTokenEncrypted: "iv:tag:ciphertext",
      capiAccessTokenEncrypted: null,
      pixelId: null,
    });

    const result = await service.getCurrent("org-1");

    expect(result).not.toHaveProperty("accessTokenEncrypted");
    expect(result).not.toHaveProperty("capiAccessTokenEncrypted");
    expect(result).toMatchObject({ hasAccessToken: true, hasCapiAccessToken: false });
  });

  it("reports hasCapiAccessToken true once Conversions API has been configured", async () => {
    const { service, prisma } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      organizationId: "org-1",
      adAccountId: "act_123",
      accessTokenEncrypted: "iv:tag:ciphertext",
      capiAccessTokenEncrypted: "iv:tag:ciphertext2",
      pixelId: "1234567890",
    });

    const result = await service.getCurrent("org-1");

    expect(result).toMatchObject({ hasCapiAccessToken: true, pixelId: "1234567890" });
  });

  it("encrypts the access token before persisting and enqueues an immediate sync on connect", async () => {
    const { service, prisma, encryption, queue } = buildService();
    prisma.metaConnection.upsert.mockResolvedValue({
      id: "conn-1",
      organizationId: "org-1",
      accessTokenEncrypted: "encrypted(system-user-token)",
    });

    await service.connect("org-1", { adAccountId: "act_123", accessToken: "system-user-token" });

    expect(encryption.encrypt).toHaveBeenCalledWith("system-user-token");
    expect(prisma.metaConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: "org-1" },
        create: expect.objectContaining({ accessTokenEncrypted: "encrypted(system-user-token)" }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      "sync",
      { organizationId: "org-1" },
      expect.objectContaining({ attempts: 5 }),
    );
  });

  it("reconnecting reuses the same row (upsert), never creating a second connection", async () => {
    const { service, prisma } = buildService();
    prisma.metaConnection.upsert.mockResolvedValue({ id: "conn-1", organizationId: "org-1" });

    await service.connect("org-1", { adAccountId: "act_123", accessToken: "token" });

    expect(prisma.metaConnection.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: "org-1" } }),
    );
  });

  it("disconnect flips status without deleting the connection row", async () => {
    const { service, prisma } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1" });

    await service.disconnect("org-1");

    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { status: "DISCONNECTED", disconnectedAt: expect.any(Date) },
    });
  });

  it("throws when trying to disconnect or sync an organization with no connection", async () => {
    const { service, prisma } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(null);

    await expect(service.disconnect("org-1")).rejects.toThrow(AppException);
    await expect(service.triggerSync("org-1")).rejects.toThrow(AppException);
  });

  it("triggerSync enqueues a job for an existing connection", async () => {
    const { service, prisma, queue } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1" });

    await service.triggerSync("org-1");

    expect(queue.add).toHaveBeenCalledWith("sync", { organizationId: "org-1" }, expect.any(Object));
  });

  describe("connectCapi (Fase 7)", () => {
    it("requires an existing Meta Ads connection before Conversions API can be configured", async () => {
      const { service, prisma } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue(null);

      await expect(
        service.connectCapi("org-1", { pixelId: "123", capiAccessToken: "capi-token" }),
      ).rejects.toThrow(AppException);
    });

    it("encrypts the CAPI token, stores the pixel id, and drains any pending conversion events", async () => {
      const { service, prisma, encryption, conversionEvents } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1" });
      prisma.metaConnection.update.mockResolvedValue({
        organizationId: "org-1",
        accessTokenEncrypted: "iv:tag:ciphertext",
        capiAccessTokenEncrypted: "encrypted(capi-token)",
        pixelId: "123",
      });

      await service.connectCapi("org-1", { pixelId: "123", capiAccessToken: "capi-token" });

      expect(encryption.encrypt).toHaveBeenCalledWith("capi-token");
      expect(prisma.metaConnection.update).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        data: { pixelId: "123", capiAccessTokenEncrypted: "encrypted(capi-token)", capiConfiguredAt: expect.any(Date) },
      });
      expect(conversionEvents.drainPending).toHaveBeenCalledWith("org-1");
    });
  });
});
