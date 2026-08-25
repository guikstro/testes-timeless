import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { AppException } from "../../common/exceptions/app-exception";
import { isUniqueConstraintError } from "../../common/utils/is-unique-constraint-error";
import { ConnectWhatsAppDto } from "./dto/connect-whatsapp.dto";

@Injectable()
export class WhatsAppConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async getCurrent(organizationId: string) {
    return this.redact(await this.prisma.whatsAppConnection.findUnique({ where: { organizationId } }));
  }

  /**
   * Idempotent: connecting again (e.g. after a disconnect, or to rotate the
   * access token) reuses the same connection row rather than creating a new
   * one, so existing conversations/leads/history never get orphaned
   * (Section 88 — reconnecting must not destroy history).
   */
  async connect(organizationId: string, dto: ConnectWhatsAppDto) {
    const conflicting = await this.prisma.whatsAppConnection.findUnique({
      where: { phoneNumberId: dto.phoneNumberId },
    });
    if (conflicting && conflicting.organizationId !== organizationId) {
      throw new AppException(
        "PHONE_NUMBER_ALREADY_CONNECTED",
        "Este número já está conectado a outra organização.",
        HttpStatus.CONFLICT,
      );
    }

    const accessTokenEncrypted = dto.accessToken ? this.encryption.encrypt(dto.accessToken) : undefined;

    try {
      const connection = await this.prisma.whatsAppConnection.upsert({
        where: { organizationId },
        create: {
          organizationId,
          phoneNumberId: dto.phoneNumberId,
          displayPhoneNumber: dto.displayPhoneNumber,
          accessTokenEncrypted,
          status: "CONNECTED",
        },
        update: {
          phoneNumberId: dto.phoneNumberId,
          displayPhoneNumber: dto.displayPhoneNumber,
          ...(accessTokenEncrypted ? { accessTokenEncrypted } : {}),
          status: "CONNECTED",
          connectedAt: new Date(),
          disconnectedAt: null,
        },
      });
      return this.redact(connection);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppException(
          "PHONE_NUMBER_ALREADY_CONNECTED",
          "Este número já está conectado a outra organização.",
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async disconnect(organizationId: string): Promise<void> {
    const existing = await this.prisma.whatsAppConnection.findUnique({ where: { organizationId } });
    if (!existing) {
      throw new AppException("NOT_CONNECTED", "Nenhuma conexão de WhatsApp encontrada.", HttpStatus.NOT_FOUND);
    }

    // Status flip only — never delete the row, so phoneNumberId keeps
    // routing any late-arriving webhook events to this org, and history
    // (conversations/leads) stays intact for a future reconnect.
    await this.prisma.whatsAppConnection.update({
      where: { organizationId },
      data: { status: "DISCONNECTED", disconnectedAt: new Date() },
    });
  }

  private redact<T extends { accessTokenEncrypted: string | null } | null>(
    connection: T,
  ): (Omit<NonNullable<T>, "accessTokenEncrypted"> & { hasAccessToken: boolean }) | null {
    if (!connection) return null;
    const { accessTokenEncrypted, ...rest } = connection;
    return { ...rest, hasAccessToken: Boolean(accessTokenEncrypted) };
  }
}
