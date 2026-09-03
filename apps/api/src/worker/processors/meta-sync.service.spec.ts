import { MetaSyncService } from "./meta-sync.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationsService } from "../../notifications/notifications.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { MetaGraphClient } from "../../integrations/meta/meta-graph-client";
import { MetaApiError } from "../../integrations/meta/meta-api-error";

describe("MetaSyncService", () => {
  function buildService() {
    const prisma = {
      metaConnection: { findUnique: jest.fn(), update: jest.fn() },
      campaign: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      adSet: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      ad: { upsert: jest.fn() },
      adSpend: { upsert: jest.fn() },
    };
    const encryption = { decrypt: jest.fn((value: string) => value.replace("encrypted(", "").replace(")", "")) };
    const metaGraphClient = {
      getCampaigns: jest.fn().mockResolvedValue([]),
      getAdSets: jest.fn().mockResolvedValue([]),
      getAds: jest.fn().mockResolvedValue([]),
      getInsights: jest.fn().mockResolvedValue([]),
    };
    const notifications = { notificar: jest.fn().mockResolvedValue(undefined) };
    const service = new MetaSyncService(
      prisma as unknown as PrismaService,
      encryption as unknown as EncryptionService,
      metaGraphClient as unknown as MetaGraphClient,
      notifications as unknown as NotificationsService,
    );
    return { service, prisma, encryption, metaGraphClient, notifications };
  }

  function connectionRow(overrides: Record<string, unknown> = {}) {
    return {
      id: "conn-1",
      organizationId: "org-1",
      adAccountId: "act_123",
      accessTokenEncrypted: "encrypted(real-token)",
      status: "CONNECTED",
      ...overrides,
    };
  }

  it("does nothing when the organization has no Meta connection (disconnected mid-flight)", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(null);

    await service.sync("org-1");

    expect(metaGraphClient.getCampaigns).not.toHaveBeenCalled();
  });

  it("does nothing when the connection was disconnected before this (possibly delayed retry) job ran", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow({ status: "DISCONNECTED" }));

    await service.sync("org-1");

    expect(metaGraphClient.getCampaigns).not.toHaveBeenCalled();
    expect(prisma.metaConnection.update).not.toHaveBeenCalled();
  });

  it("decrypts the token before calling the Graph API", async () => {
    const { service, prisma, encryption, metaGraphClient } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());

    await service.sync("org-1");

    expect(encryption.decrypt).toHaveBeenCalledWith("encrypted(real-token)");
    expect(metaGraphClient.getCampaigns).toHaveBeenCalledWith("act_123", "real-token");
  });

  it("upserts campaigns, links ad sets to their internal campaign id, and links ads to their internal ad set id", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
    metaGraphClient.getCampaigns.mockResolvedValue([{ id: "c1", name: "Direito Trabalhista", status: "ACTIVE" }]);
    metaGraphClient.getAdSets.mockResolvedValue([{ id: "as1", name: "Fortaleza 25-55", status: "ACTIVE", campaign_id: "c1" }]);
    metaGraphClient.getAds.mockResolvedValue([{ id: "ad1", name: "Rescisão Indireta - Vídeo 01", status: "ACTIVE", adset_id: "as1" }]);
    prisma.campaign.findMany.mockResolvedValue([{ id: "internal-campaign-1", externalId: "c1" }]);
    prisma.adSet.findMany.mockResolvedValue([{ id: "internal-adset-1", externalId: "as1" }]);

    await service.sync("org-1");

    expect(prisma.campaign.upsert).toHaveBeenCalledWith({
      where: { externalId: "c1" },
      create: expect.objectContaining({ organizationId: "org-1", externalId: "c1", name: "Direito Trabalhista" }),
      update: expect.objectContaining({ name: "Direito Trabalhista", status: "ACTIVE" }),
    });
    expect(prisma.adSet.upsert).toHaveBeenCalledWith({
      where: { externalId: "as1" },
      create: expect.objectContaining({ campaignId: "internal-campaign-1", externalId: "as1" }),
      update: expect.objectContaining({ campaignId: "internal-campaign-1" }),
    });
    expect(prisma.ad.upsert).toHaveBeenCalledWith({
      where: { externalId: "ad1" },
      create: expect.objectContaining({ adSetId: "internal-adset-1", externalId: "ad1" }),
      update: expect.objectContaining({ adSetId: "internal-adset-1" }),
    });
  });

  it("skips an ad set whose campaign wasn't synced, instead of guessing or crashing", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
    metaGraphClient.getAdSets.mockResolvedValue([{ id: "as1", name: "Orphan", status: "ACTIVE", campaign_id: "unknown-campaign" }]);
    prisma.campaign.findMany.mockResolvedValue([]);

    await service.sync("org-1");

    expect(prisma.adSet.upsert).not.toHaveBeenCalled();
  });

  it("converts insight spend (a decimal string) into integer cents and upserts by (campaign, date)", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
    prisma.campaign.findMany.mockResolvedValue([{ id: "internal-campaign-1", externalId: "c1" }]);
    metaGraphClient.getInsights.mockResolvedValue([{ campaign_id: "c1", spend: "123.45", date_start: "2026-08-01" }]);

    await service.sync("org-1");

    expect(prisma.adSpend.upsert).toHaveBeenCalledWith({
      where: { campaignId_date: { campaignId: "internal-campaign-1", date: new Date("2026-08-01") } },
      create: { campaignId: "internal-campaign-1", date: new Date("2026-08-01"), spendCents: 12345 },
      update: { spendCents: 12345 },
    });
  });

  it("marks the connection CONNECTED with a fresh lastSyncedAt on a fully successful sync", async () => {
    const { service, prisma } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());

    await service.sync("org-1");

    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { status: "CONNECTED", lastSyncedAt: expect.any(Date), lastSyncError: null },
    });
  });

  it("marks the connection TOKEN_EXPIRED on a Meta 190 error, and re-throws so BullMQ still sees the failure", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
    metaGraphClient.getCampaigns.mockRejectedValue(new MetaApiError(190, 463, "Error validating access token"));

    await expect(service.sync("org-1")).rejects.toThrow(MetaApiError);

    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { status: "TOKEN_EXPIRED", lastSyncError: "Error validating access token" },
    });
  });

  it("does not flip the connection to a failed state on a rate-limit error — leaves it for the retry", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
    metaGraphClient.getCampaigns.mockRejectedValue(new MetaApiError(17, undefined, "User request limit reached"));

    await expect(service.sync("org-1")).rejects.toThrow(MetaApiError);

    expect(prisma.metaConnection.update).not.toHaveBeenCalled();
  });

  it("marks the connection SYNC_FAILED on any other error", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
    metaGraphClient.getCampaigns.mockRejectedValue(new Error("network timeout"));

    await expect(service.sync("org-1")).rejects.toThrow("network timeout");

    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { status: "SYNC_FAILED", lastSyncError: "network timeout" },
    });
  });

  describe("aviso de falha", () => {
    it("avisa na primeira falha, e não repete enquanto continuar falhando", async () => {
      const { service, prisma, metaGraphClient, notifications } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue({
        organizationId: "org-1",
        adAccountId: "act_1",
        status: "CONNECTED",
        accessTokenEncrypted: "cifrado",
      });
      metaGraphClient.getCampaigns.mockRejectedValue(new Error("deu ruim"));

      await expect(service.sync("org-1")).rejects.toThrow("deu ruim");
      expect(notifications.notificar).toHaveBeenCalledWith(
        expect.objectContaining({ type: "sistema.erro", organizationId: "org-1" }),
      );

      // Segunda rodada com a conexão já marcada como quebrada: a sincronia
      // roda de hora em hora, e repetir o mesmo aviso encheria o sino com um
      // problema só, que é o jeito mais rápido de ensinar alguém a ignorá-lo.
      notifications.notificar.mockClear();
      prisma.metaConnection.findUnique.mockResolvedValue({
        organizationId: "org-1",
        adAccountId: "act_1",
        status: "SYNC_FAILED",
        accessTokenEncrypted: "cifrado",
      });

      await expect(service.sync("org-1")).rejects.toThrow("deu ruim");
      expect(notifications.notificar).not.toHaveBeenCalled();
    });

    it("marca a conexão e avisa quando o token guardado não pode ser decifrado", async () => {
      const { service, prisma, encryption, notifications } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue({
        organizationId: "org-1",
        adAccountId: "act_1",
        status: "CONNECTED",
        accessTokenEncrypted: "corrompido",
      });
      encryption.decrypt.mockImplementation(() => {
        throw new Error("Malformed encrypted payload");
      });

      await expect(service.sync("org-1")).rejects.toThrow("Malformed encrypted payload");

      // Antes o decifrar ficava fora do try: toda sincronia falhava, a
      // conexão continuava dizendo "conectado" e ninguém era avisado.
      expect(prisma.metaConnection.update).toHaveBeenCalledWith({
        where: { organizationId: "org-1" },
        data: expect.objectContaining({ status: "SYNC_FAILED" }),
      });
      expect(notifications.notificar).toHaveBeenCalledWith(
        expect.objectContaining({ type: "sistema.erro" }),
      );
    });
  });
});
