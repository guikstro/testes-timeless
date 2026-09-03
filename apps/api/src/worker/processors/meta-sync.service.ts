import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { MetaGraphClient, InsightsRange } from "../../integrations/meta/meta-graph-client";
import { MetaApiError } from "../../integrations/meta/meta-api-error";
import { NotificationsService } from "../../notifications/notifications.service";

const INSIGHTS_LOOKBACK_DAYS = 7;

/**
 * Fetches the current campaign/adset/ad hierarchy and recent daily spend
 * from Meta and upserts it locally — never depends on live Meta calls for
 * the dashboard itself (Section 51). Re-fetches only a short recent window
 * of insights each run rather than full history ("incremental" per Section
 * 86); campaigns/adsets/ads are small enough in practice to fully refresh
 * every sync.
 */
@Injectable()
export class MetaSyncService {
  private readonly logger = new Logger(MetaSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly metaGraphClient: MetaGraphClient,
    private readonly notifications: NotificationsService,
  ) {}

  async sync(organizationId: string): Promise<void> {
    const connection = await this.prisma.metaConnection.findUnique({ where: { organizationId } });
    if (!connection || connection.status === "DISCONNECTED") {
      // Deleted, or disconnected between enqueue and processing (including a
      // pending retry that outlives a user's disconnect click) — a stale job
      // must never resurrect a connection the user explicitly turned off.
      return;
    }

    try {
      /*
        Dentro do try de propósito.

        Estava fora, e isso criava um jeito calado de falhar: se a chave de
        criptografia mudar ou o token guardado corromper, o decifrar lança
        antes de qualquer tratamento, a conexão continua marcada como
        conectada, e ninguém é avisado. Toda sincronia falha e a tela segue
        dizendo que está tudo bem, que é o pior estado possível para um
        número que o cliente lê como verdade.
      */
      const accessToken = this.encryption.decrypt(connection.accessTokenEncrypted);

      const [campaigns, adSets, ads] = await Promise.all([
        this.metaGraphClient.getCampaigns(connection.adAccountId, accessToken),
        this.metaGraphClient.getAdSets(connection.adAccountId, accessToken),
        this.metaGraphClient.getAds(connection.adAccountId, accessToken),
      ]);

      const now = new Date();

      for (const campaign of campaigns) {
        await this.prisma.campaign.upsert({
          where: { externalId: campaign.id },
          create: {
            organizationId,
            externalId: campaign.id,
            name: campaign.name,
            status: campaign.status,
            platform: "META",
            lastSyncedAt: now,
          },
          // `platform` também no update: uma campanha lançada à mão que depois
          // apareça na sincronização passa a ser reconhecida como da Meta, em
          // vez de manter o rótulo de quando foi digitada.
          update: { name: campaign.name, status: campaign.status, platform: "META", manual: false, lastSyncedAt: now },
        });
      }

      // Batch-loaded once per level instead of one findUnique per row
      // (Section 75 — avoid N+1) — campaign/adset volumes are trivial per
      // organization, so this is a handful of queries total, not hundreds.
      const campaignRows = await this.prisma.campaign.findMany({ where: { organizationId } });
      const campaignIdByExternalId = new Map(campaignRows.map((c) => [c.externalId, c.id]));

      for (const adSet of adSets) {
        const campaignId = campaignIdByExternalId.get(adSet.campaign_id);
        if (!campaignId) continue; // ad set for a campaign we don't know about — skip, don't guess
        await this.prisma.adSet.upsert({
          where: { externalId: adSet.id },
          create: { campaignId, externalId: adSet.id, name: adSet.name, status: adSet.status, lastSyncedAt: now },
          update: { campaignId, name: adSet.name, status: adSet.status, lastSyncedAt: now },
        });
      }

      const adSetRows = await this.prisma.adSet.findMany({ where: { campaign: { organizationId } } });
      const adSetIdByExternalId = new Map(adSetRows.map((a) => [a.externalId, a.id]));

      for (const ad of ads) {
        const adSetId = adSetIdByExternalId.get(ad.adset_id);
        if (!adSetId) continue;
        await this.prisma.ad.upsert({
          where: { externalId: ad.id },
          create: { adSetId, externalId: ad.id, name: ad.name, status: ad.status, lastSyncedAt: now },
          update: { adSetId, name: ad.name, status: ad.status, lastSyncedAt: now },
        });
      }

      const range = this.lastNDaysRange(INSIGHTS_LOOKBACK_DAYS);
      const insights = await this.metaGraphClient.getInsights(connection.adAccountId, accessToken, range);

      for (const insight of insights) {
        const campaignId = campaignIdByExternalId.get(insight.campaign_id);
        if (!campaignId) continue;
        const spendCents = Math.round(Number(insight.spend) * 100);
        await this.prisma.adSpend.upsert({
          where: { campaignId_date: { campaignId, date: new Date(insight.date_start) } },
          create: { campaignId, date: new Date(insight.date_start), spendCents },
          update: { spendCents },
        });
      }

      await this.prisma.metaConnection.update({
        where: { organizationId },
        data: { status: "CONNECTED", lastSyncedAt: now, lastSyncError: null },
      });
    } catch (error) {
      await this.handleSyncError(organizationId, error);
      throw error; // let BullMQ retry per the job's configured attempts/backoff
    }
  }

  private async handleSyncError(organizationId: string, error: unknown): Promise<void> {
    // O estado anterior decide se alguém precisa ser avisado. A sincronia roda
    // de hora em hora: avisar a cada falha encheria o sino com o mesmo
    // problema, e um sino cheio de repetição é um sino que ninguém lê.
    const antes = await this.prisma.metaConnection.findUnique({
      where: { organizationId },
      select: { status: true },
    });
    const jaEstavaQuebrada = antes?.status === "TOKEN_EXPIRED" || antes?.status === "SYNC_FAILED";

    if (error instanceof MetaApiError && error.isTokenExpired) {
      await this.prisma.metaConnection.update({
        where: { organizationId },
        data: { status: "TOKEN_EXPIRED", lastSyncError: error.message },
      });
      if (!jaEstavaQuebrada) {
        await this.avisar(
          organizationId,
          "Meta Ads desconectou",
          "O acesso expirou. Reconecte em Integrações para o gasto voltar a ser sincronizado.",
        );
      }
      return;
    }

    if (error instanceof MetaApiError && error.isRateLimited) {
      // Transient — leave the connection's status alone and let the retry
      // (with backoff) resolve it rather than surfacing a false failure.
      this.logger.warn(JSON.stringify({ event: "meta_sync_rate_limited", organizationId }));
      return;
    }

    const message = error instanceof Error ? error.message : "Erro desconhecido na sincronização.";
    await this.prisma.metaConnection.update({
      where: { organizationId },
      data: { status: "SYNC_FAILED", lastSyncError: message },
    });

    if (!jaEstavaQuebrada) {
      await this.avisar(
        organizationId,
        "Sincronização do Meta Ads falhou",
        // A causa vai junto: sem ela o aviso obriga a abrir outra tela só
        // para descobrir o que houve.
        `O gasto das campanhas pode estar desatualizado. ${message}`,
      );
    }
  }

  /**
   * Avisa a operação. Nunca lança: a sincronia não pode falhar por causa do
   * aviso sobre ela ter falhado.
   */
  private async avisar(organizationId: string, titulo: string, corpo: string): Promise<void> {
    await this.notifications.notificar({
      type: "sistema.erro",
      organizationId,
      title: titulo,
      body: corpo,
    });
  }

  private lastNDaysRange(days: number): InsightsRange {
    const until = new Date();
    const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
    return { since: this.formatDate(since), until: this.formatDate(until) };
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
