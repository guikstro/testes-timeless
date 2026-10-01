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
      ad: { upsert: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      adSpend: { upsert: jest.fn() },
      adInsight: { upsert: jest.fn() },
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
      where: { organizationId_externalId: { organizationId: "org-1", externalId: "c1" } },
      create: expect.objectContaining({ organizationId: "org-1", externalId: "c1", name: "Direito Trabalhista" }),
      update: expect.objectContaining({ name: "Direito Trabalhista", status: "ACTIVE" }),
    });
    expect(prisma.adSet.upsert).toHaveBeenCalledWith({
      // Dentro da campanha, e não pelo id externo solto: ele era único no
      // sistema inteiro, e um id ocupado por outro cliente fazia esta
      // atualização escrever na linha dele.
      where: { campaignId_externalId: { campaignId: "internal-campaign-1", externalId: "as1" } },
      create: expect.objectContaining({ campaignId: "internal-campaign-1", externalId: "as1" }),
      update: expect.objectContaining({ campaignId: "internal-campaign-1" }),
    });
    expect(prisma.ad.upsert).toHaveBeenCalledWith({
      where: { adSetId_externalId: { adSetId: "internal-adset-1", externalId: "ad1" } },
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
      create: {
        campaignId: "internal-campaign-1",
        date: new Date("2026-08-01"),
        spendCents: 12345,
        conversasIniciadas: 0,
        impressoes: 0,
        cliques: 0,
      },
      update: { spendCents: 12345, conversasIniciadas: 0, impressoes: 0, cliques: 0 },
    });
  });

  describe("desempenho por anúncio", () => {
    it("pede os números com a janela recente, uma vez por sincronia", async () => {
      const { service, prisma, metaGraphClient } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());

      await service.sync("org-1");

      // O produto já sabia qual anúncio trouxe cada lead; sem estes números
      // no mesmo nível, nunca saberia quanto ele custou.
      expect(metaGraphClient.getInsights).toHaveBeenCalledTimes(1);
      expect(metaGraphClient.getInsights).toHaveBeenCalledWith(
        "act_123",
        "real-token",
        expect.objectContaining({ since: expect.any(String), until: expect.any(String) }),
      );
    });

    /*
      A regressão que este desenho podia introduzir.

      As linhas passaram a vir por anúncio, e várias caem na mesma campanha e
      no mesmo dia. Gravando uma a uma, como antes, o total da campanha
      viraria o gasto do último anúncio do laço — corrupção silenciosa de um
      número que o cliente usa para decidir investimento.
    */
    it("soma os anúncios no total da campanha, em vez de sobrescrever", async () => {
      const { service, prisma, metaGraphClient } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
      prisma.campaign.findMany.mockResolvedValue([{ id: "interna-1", externalId: "c1" }]);
      prisma.ad.findMany.mockResolvedValue([
        { id: "anuncio-a", externalId: "ad1" },
        { id: "anuncio-b", externalId: "ad2" },
      ]);
      metaGraphClient.getInsights.mockResolvedValue([
        { campaign_id: "c1", ad_id: "ad1", spend: "100.00", date_start: "2026-08-01" },
        { campaign_id: "c1", ad_id: "ad2", spend: "50.50", date_start: "2026-08-01" },
      ]);

      await service.sync("org-1");

      expect(prisma.adSpend.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.adSpend.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { spendCents: 15050, conversasIniciadas: 0, impressoes: 0, cliques: 0 } }),
      );
    });

    /*
      O CTR, o CPM e o CPC da tela de campanhas saem daqui. Somados da resposta
      inteira, como o gasto, inclusive de anúncio que já não existe mais.
    */
    it("soma impressões e cliques no total da campanha, junto com o gasto", async () => {
      const { service, prisma, metaGraphClient } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
      prisma.campaign.findMany.mockResolvedValue([{ id: "interna-1", externalId: "c1" }]);
      prisma.ad.findMany.mockResolvedValue([{ id: "anuncio-a", externalId: "ad1" }]);
      metaGraphClient.getInsights.mockResolvedValue([
        { campaign_id: "c1", ad_id: "ad1", spend: "10.00", impressions: "1000", clicks: "20", date_start: "2026-08-01" },
        { campaign_id: "c1", ad_id: "apagado", spend: "5.00", impressions: "500", clicks: "5", date_start: "2026-08-01" },
      ]);

      await service.sync("org-1");

      expect(prisma.adSpend.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { spendCents: 1500, conversasIniciadas: 0, impressoes: 1500, cliques: 25 } }),
      );
    });

    it("guarda o objetivo de cada campanha", async () => {
      const { service, prisma, metaGraphClient } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
      metaGraphClient.getCampaigns.mockResolvedValue([
        { id: "c1", name: "Tráfego site", status: "ACTIVE", objective: "OUTCOME_TRAFFIC" },
      ]);

      await service.sync("org-1");

      expect(prisma.campaign.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ objetivo: "OUTCOME_TRAFFIC" }),
          update: expect.objectContaining({ objetivo: "OUTCOME_TRAFFIC" }),
        }),
      );
    });

    it("guarda o gasto, as impressões e os cliques de cada anúncio", async () => {
      const { service, prisma, metaGraphClient } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
      prisma.campaign.findMany.mockResolvedValue([{ id: "interna-1", externalId: "c1" }]);
      prisma.ad.findMany.mockResolvedValue([{ id: "anuncio-a", externalId: "ad1" }]);
      metaGraphClient.getInsights.mockResolvedValue([
        { campaign_id: "c1", ad_id: "ad1", spend: "34.00", impressions: "1200", clicks: "48", date_start: "2026-08-01" },
      ]);

      await service.sync("org-1");

      expect(prisma.adInsight.upsert).toHaveBeenCalledWith({
        where: { adId_date: { adId: "anuncio-a", date: new Date("2026-08-01") } },
        create: { adId: "anuncio-a", date: new Date("2026-08-01"), spendCents: 3400, impressions: 1200, clicks: 48, conversasIniciadas: 0 },
        update: { spendCents: 3400, impressions: 1200, clicks: 48, conversasIniciadas: 0 },
      });
    });

    it("conta no total da campanha o gasto de anúncio que já não existe mais", async () => {
      const { service, prisma, metaGraphClient } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
      prisma.campaign.findMany.mockResolvedValue([{ id: "interna-1", externalId: "c1" }]);
      // Nenhum anúncio casa: o apagado saiu da conta mas o gasto dele existiu.
      prisma.ad.findMany.mockResolvedValue([]);
      metaGraphClient.getInsights.mockResolvedValue([
        { campaign_id: "c1", ad_id: "apagado", spend: "80.00", date_start: "2026-08-01" },
      ]);

      await service.sync("org-1");

      // Somar só o que conseguimos casar encolheria o total em silêncio.
      expect(prisma.adSpend.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { spendCents: 8000, conversasIniciadas: 0, impressoes: 0, cliques: 0 } }),
      );
      expect(prisma.adInsight.upsert).not.toHaveBeenCalled();
    });

    it("mantém os dias separados", async () => {
      const { service, prisma, metaGraphClient } = buildService();
      prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
      prisma.campaign.findMany.mockResolvedValue([{ id: "interna-1", externalId: "c1" }]);
      metaGraphClient.getInsights.mockResolvedValue([
        { campaign_id: "c1", ad_id: "ad1", spend: "10.00", date_start: "2026-08-01" },
        { campaign_id: "c1", ad_id: "ad1", spend: "20.00", date_start: "2026-08-02" },
      ]);

      await service.sync("org-1");

      expect(prisma.adSpend.upsert).toHaveBeenCalledTimes(2);
    });
  });

  it("marks the connection CONNECTED with a fresh lastSyncedAt on a fully successful sync", async () => {
    const { service, prisma } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());

    await service.sync("org-1");

    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { status: "CONNECTED", lastSyncedAt: expect.any(Date), lastSyncError: null, limitadaAte: null },
    });
  });

  /*
    Dentro do bloqueio, a chamada seria recusada, contaria como erro e
    manteria o bloqueio de pé. A Meta só libera o acesso completo para quem
    erra menos de 15% das chamadas.
  */
  it("does not call Meta at all while its block lasts", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    const ate = new Date(Date.now() + 5 * 60_000);
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow({ limitadaAte: ate }));

    await expect(service.sync("org-1")).resolves.toEqual({ limitadaAte: ate });

    expect(metaGraphClient.getCampaigns).not.toHaveBeenCalled();
    expect(prisma.metaConnection.update).not.toHaveBeenCalled();
  });

  it("calls Meta again once the block is over, and clears it when the sync works", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow({ limitadaAte: new Date(Date.now() - 60_000) }));

    await expect(service.sync("org-1")).resolves.toEqual({ limitadaAte: null });

    expect(metaGraphClient.getCampaigns).toHaveBeenCalled();
    expect(prisma.metaConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ limitadaAte: null, lastSyncError: null }) }),
    );
  });

  it("marks the connection TOKEN_EXPIRED on a Meta 190 error, and re-throws so BullMQ still sees the failure", async () => {
    const { service, prisma, metaGraphClient } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
    metaGraphClient.getCampaigns.mockRejectedValue(new MetaApiError(190, 463, "Error validating access token"));

    await expect(service.sync("org-1")).rejects.toThrow(MetaApiError);

    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { status: "TOKEN_EXPIRED", lastSyncError: expect.stringContaining("(Meta: Error validating access token)") },
    });
  });

  /*
    O limite é passageiro: o status continua conectado e a retentativa segue.
    Mas o motivo fica gravado. Sem ele, a conta recém-conectada que batia no
    limite ficava em "última sincronização: nunca" sem nada escrito, e quem
    colou o token concluía que tinha errado no passo a passo.
  */
  it("on a rate-limit error, keeps the status, records why and until when, and does not throw", async () => {
    const { service, prisma, metaGraphClient, notifications } = buildService();
    prisma.metaConnection.findUnique.mockResolvedValue(connectionRow());
    // A Meta diz 4 minutos; o bloqueio padrão é de 5, e ele vale.
    metaGraphClient.getCampaigns.mockRejectedValue(new MetaApiError(17, 2446079, "User request limit reached", 400, 240));
    const antes = Date.now();

    // Sem lançar: a retentativa do BullMQ viria em segundos, dentro do
    // bloqueio, e só somaria erro.
    const { limitadaAte } = await service.sync("org-1");

    expect(limitadaAte).toBeInstanceOf(Date);
    const minutos = (limitadaAte!.getTime() - antes) / 60_000;
    expect(minutos).toBeGreaterThanOrEqual(5.9);
    expect(minutos).toBeLessThanOrEqual(6.1);
    expect(prisma.metaConnection.update).toHaveBeenCalledTimes(1);
    expect(prisma.metaConnection.update).toHaveBeenCalledWith({
      where: { organizationId: "org-1" },
      data: { lastSyncError: expect.stringContaining("A Meta bloqueou as chamadas"), limitadaAte },
    });
    // Passageiro não vai para o sino: o bloqueio acaba em minutos.
    expect(notifications.notificar).not.toHaveBeenCalled();
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
