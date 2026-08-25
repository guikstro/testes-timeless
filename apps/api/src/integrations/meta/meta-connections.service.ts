import { HttpStatus, Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { AppException } from "../../common/exceptions/app-exception";
import { isUniqueConstraintError } from "../../common/utils/is-unique-constraint-error";
import { META_SYNC_QUEUE } from "../../common/queue/queue.constants";
import { MetaSyncJob } from "../../common/queue/meta-sync.job";
import { ConnectMetaDto } from "./dto/connect-meta.dto";
import { ConnectMetaCapiDto } from "./dto/connect-meta-capi.dto";
import { ConversionEventsService } from "./conversion-events.service";

@Injectable()
export class MetaConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly conversionEvents: ConversionEventsService,
    @InjectQueue(META_SYNC_QUEUE) private readonly syncQueue: Queue<MetaSyncJob>,
  ) {}

  async getCurrent(organizationId: string) {
    return this.redact(await this.prisma.metaConnection.findUnique({ where: { organizationId } }));
  }

  /** Idempotent, same pattern as WhatsApp (Fase 3): reconnecting reuses the same row, never orphans synced campaigns. */
  async connect(organizationId: string, dto: ConnectMetaDto) {
    const accessTokenEncrypted = this.encryption.encrypt(dto.accessToken);

    try {
      const connection = await this.prisma.metaConnection.upsert({
        where: { organizationId },
        create: { organizationId, adAccountId: dto.adAccountId, accessTokenEncrypted, status: "CONNECTED" },
        update: {
          adAccountId: dto.adAccountId,
          accessTokenEncrypted,
          status: "CONNECTED",
          connectedAt: new Date(),
          disconnectedAt: null,
          lastSyncError: null,
        },
      });

      await this.syncQueue.add(
        "sync",
        { organizationId },
        { attempts: 5, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true, removeOnFail: 20 },
      );

      return this.redact(connection);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppException("CONNECTION_CONFLICT", "Não foi possível conectar esta conta.", HttpStatus.CONFLICT);
      }
      throw error;
    }
  }

  async disconnect(organizationId: string): Promise<void> {
    const existing = await this.prisma.metaConnection.findUnique({ where: { organizationId } });
    if (!existing) {
      throw new AppException("NOT_CONNECTED", "Nenhuma conexão com a Meta encontrada.", HttpStatus.NOT_FOUND);
    }

    await this.prisma.metaConnection.update({
      where: { organizationId },
      data: { status: "DISCONNECTED", disconnectedAt: new Date() },
    });
  }

  async triggerSync(organizationId: string): Promise<void> {
    const connection = await this.prisma.metaConnection.findUnique({ where: { organizationId } });
    if (!connection) {
      throw new AppException("NOT_CONNECTED", "Nenhuma conexão com a Meta encontrada.", HttpStatus.NOT_FOUND);
    }

    await this.syncQueue.add(
      "sync",
      { organizationId },
      { attempts: 5, backoff: { type: "exponential", delay: 5000 }, removeOnComplete: true, removeOnFail: 20 },
    );
  }

  /**
   * Fase 7 setup step, deliberately separate from `connect()` (Fase 6): the
   * Pixel + Conversions API token are a different Meta resource/permission
   * than ad-account read access, often configured later/by someone else —
   * see docs/META_CAPI.md. Requires an existing connection (mirrors the
   * mandated phase order: Ads before Conversions API).
   */
  async connectCapi(organizationId: string, dto: ConnectMetaCapiDto) {
    const existing = await this.prisma.metaConnection.findUnique({ where: { organizationId } });
    if (!existing) {
      throw new AppException(
        "NOT_CONNECTED",
        "Conecte a conta de anúncios da Meta antes de configurar o Conversions API.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const capiAccessTokenEncrypted = this.encryption.encrypt(dto.capiAccessToken);
    const connection = await this.prisma.metaConnection.update({
      where: { organizationId },
      data: { pixelId: dto.pixelId, capiAccessTokenEncrypted, capiConfiguredAt: new Date() },
    });

    // Anything recorded before CAPI was configured (or that failed while it
    // was misconfigured) can finally go out now.
    await this.conversionEvents.drainPending(organizationId);

    return this.redact(connection);
  }

  private redact<T extends { accessTokenEncrypted: string; capiAccessTokenEncrypted: string | null } | null>(
    connection: T,
  ): (Omit<NonNullable<T>, "accessTokenEncrypted" | "capiAccessTokenEncrypted"> & {
    hasAccessToken: true;
    hasCapiAccessToken: boolean;
  }) | null {
    if (!connection) return null;
    const { accessTokenEncrypted, capiAccessTokenEncrypted, ...rest } = connection;
    void accessTokenEncrypted;
    return { ...rest, hasAccessToken: true, hasCapiAccessToken: capiAccessTokenEncrypted !== null };
  }
}
