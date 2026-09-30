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

  it("disconnect flips status without deleting the connection row, and drops the old error", async () => {
    const { service, prisma } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1" });

    await service.disconnect("org-1");

    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { status: "DISCONNECTED", disconnectedAt: expect.any(Date), lastSyncError: null },
    });
  });

  it("não sincroniza uma conexão desligada", async () => {
    const { service, prisma, queue } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1", status: "DISCONNECTED" });

    await expect(service.triggerSync("org-1")).rejects.toMatchObject({ response: { code: "NOT_CONNECTED" } });
    expect(queue.add).not.toHaveBeenCalled();
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
    expect(queue.add.mock.calls[0][2]).not.toHaveProperty("delay");
  });

  describe("bloqueio da Meta", () => {
    const daqui = (minutos: number) => new Date(Date.now() + minutos * 60_000);

    /*
      Clicar dentro do bloqueio só o renovava. O pedido não se perde: fica
      para o fim do bloqueio, e vários cliques viram um pedido só.
    */
    it("o pedido feito durante o bloqueio fica para quando ele acabar", async () => {
      const { service, prisma, queue } = buildService();
      const ate = daqui(4);
      prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1", status: "CONNECTED", limitadaAte: ate });

      await service.triggerSync("org-1");
      await service.triggerSync("org-1");

      const opcoes = queue.add.mock.calls.map((chamada) => chamada[2] as { delay: number; jobId: string });
      expect(opcoes[0].delay).toBeGreaterThan(3 * 60_000);
      expect(opcoes[0].jobId).toBe(`sync-pedida:org-1:${Math.floor(ate.getTime() / 60_000)}`);
      expect(opcoes[1].jobId).toBe(opcoes[0].jobId);
    });

    it("depois do bloqueio, o pedido roda na hora", async () => {
      const { service, prisma, queue } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue({ organizationId: "org-1", status: "CONNECTED", limitadaAte: daqui(-1) });

      await service.triggerSync("org-1");

      expect(queue.add.mock.calls[0][2]).not.toHaveProperty("delay");
    });

    it("colar outro token na mesma conta não desfaz o bloqueio", async () => {
      const { service, prisma, queue } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue({ adAccountId: "act_123", limitadaAte: daqui(4) });
      prisma.metaConnection.upsert.mockResolvedValue({ id: "conn-1", organizationId: "org-1" });

      await service.connect("org-1", { adAccountId: "act_123", accessToken: "outro-token" });

      expect(prisma.metaConnection.upsert.mock.calls[0][0].update).not.toHaveProperty("limitadaAte");
      expect(queue.add.mock.calls[0][2]).toHaveProperty("delay");
    });

    it("trocar de conta de anúncios começa sem o bloqueio da anterior", async () => {
      const { service, prisma, queue } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue({ adAccountId: "act_999", limitadaAte: daqui(4) });
      prisma.metaConnection.upsert.mockResolvedValue({ id: "conn-1", organizationId: "org-1" });

      await service.connect("org-1", { adAccountId: "act_123", accessToken: "token" });

      expect(prisma.metaConnection.upsert.mock.calls[0][0].update).toMatchObject({ limitadaAte: null });
      expect(queue.add.mock.calls[0][2]).not.toHaveProperty("delay");
    });
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
