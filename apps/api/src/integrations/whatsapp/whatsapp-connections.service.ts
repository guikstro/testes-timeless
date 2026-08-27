import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { WhatsAppConnection } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { AppException } from "../../common/exceptions/app-exception";
import { isUniqueConstraintError } from "../../common/utils/is-unique-constraint-error";
import { normalizePhone } from "../../common/utils/normalize-phone";
import { ConnectWhatsAppDto } from "./dto/connect-whatsapp.dto";
import { EvolutionClient } from "./evolution-client";
import { EvolutionApiError } from "./evolution-api-error";

@Injectable()
export class WhatsAppConnectionsService {
  private readonly logger = new Logger(WhatsAppConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly evolution: EvolutionClient,
  ) {}

  async getCurrent(organizationId: string) {
    return this.redact(await this.prisma.whatsAppConnection.findUnique({ where: { organizationId } }));
  }

  /**
   * Provider CLOUD_API (Fase 3). Idempotente: conectar de novo (depois de um
   * disconnect, ou para trocar o access token) reusa a mesma linha em vez de
   * criar outra, então conversas/leads existentes nunca ficam órfãos
   * (Seção 88 — reconectar não pode destruir histórico).
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
          provider: "CLOUD_API",
          phoneNumberId: dto.phoneNumberId,
          displayPhoneNumber: dto.displayPhoneNumber,
          accessTokenEncrypted,
          status: "CONNECTED",
        },
        update: {
          provider: "CLOUD_API",
          phoneNumberId: dto.phoneNumberId,
          displayPhoneNumber: dto.displayPhoneNumber,
          // Trocar de provider precisa limpar a chave de roteamento do outro:
          // uma instância órfã da Evolution ainda entregaria webhooks que
          // criariam leads por um caminho que a organização não usa mais.
          instanceName: null,
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

  /**
   * Provider EVOLUTION (Fase 8). Cria/reusa a instância e devolve o QR Code
   * para a organização ler no celular. O nome da instância é derivado do
   * `organizationId` de propósito: é estável entre reconexões (não vaza
   * instâncias órfãs na Evolution a cada tentativa) e único por construção,
   * o que o torna uma chave de roteamento multi-tenant segura.
   */
  async connectViaQrCode(organizationId: string) {
    const instanceName = this.instanceNameFor(organizationId);

    // Criar quando já existe devolve erro na Evolution; como o nome é
    // determinístico, uma segunda tentativa é o caso normal (reconexão),
    // não um erro — por isso a criação é best-effort e o QR vem depois.
    try {
      await this.evolution.createInstance(instanceName, this.webhookUrl());
    } catch (error) {
      if (!(error instanceof EvolutionApiError)) throw error;
      this.logger.log(
        JSON.stringify({ event: "evolution_instance_reused", organizationId, reason: error.message }),
      );
    }

    await this.prisma.whatsAppConnection.upsert({
      where: { organizationId },
      create: { organizationId, provider: "EVOLUTION", instanceName, status: "PENDING_QR" },
      update: {
        provider: "EVOLUTION",
        instanceName,
        // Ver a nota simétrica em connect(): a chave do outro provider sai.
        phoneNumberId: null,
        status: "PENDING_QR",
        connectedAt: new Date(),
        disconnectedAt: null,
      },
    });

    return this.getQrCode(organizationId);
  }

  /**
   * QR atual + status. A Evolution rotaciona o código a cada ~30s, então a
   * UI chama isto repetidamente enquanto o status for PENDING_QR — e é aqui
   * que a leitura bem-sucedida do QR vira CONNECTED no nosso banco.
   */
  async getQrCode(organizationId: string) {
    const connection = await this.requireEvolutionConnection(organizationId);
    const state = await this.evolution.getConnectionState(connection.instanceName!);

    if (state === "open") {
      const updated = await this.markConnected(connection);
      return { status: updated.status, qrCodeBase64: null, displayPhoneNumber: updated.displayPhoneNumber };
    }

    const qr = await this.evolution.getQrCode(connection.instanceName!);
    return { status: "PENDING_QR" as const, qrCodeBase64: qr.base64, displayPhoneNumber: null };
  }

  async disconnect(organizationId: string): Promise<void> {
    const existing = await this.prisma.whatsAppConnection.findUnique({ where: { organizationId } });
    if (!existing) {
      throw new AppException("NOT_CONNECTED", "Nenhuma conexão de WhatsApp encontrada.", HttpStatus.NOT_FOUND);
    }

    if (existing.provider === "EVOLUTION" && existing.instanceName) {
      // Sem o logout, o aparelho continuaria pareado do lado da Evolution e
      // mensagens seguiriam chegando por webhook depois de "desconectar".
      try {
        await this.evolution.logout(existing.instanceName);
      } catch (error) {
        // Já desconectado do outro lado é o resultado desejado, não um erro:
        // o estado local abaixo é a fonte da verdade para a aplicação.
        if (!(error instanceof EvolutionApiError)) throw error;
        this.logger.warn(
          JSON.stringify({ event: "evolution_logout_failed", organizationId, reason: error.message }),
        );
      }
    }

    // Só troca de status — nunca apaga a linha, para a chave de roteamento
    // continuar direcionando eventos atrasados à organização certa e o
    // histórico (conversas/leads) sobreviver a uma futura reconexão.
    await this.prisma.whatsAppConnection.update({
      where: { organizationId },
      data: { status: "DISCONNECTED", disconnectedAt: new Date() },
    });
  }

  /** Chamado pelo webhook de `CONNECTION_UPDATE` da Evolution, não pela UI. */
  async syncEvolutionState(instanceName: string, state: "open" | "connecting" | "close"): Promise<void> {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { instanceName } });
    if (!connection) return;

    if (state === "open") {
      await this.markConnected(connection);
      return;
    }

    if (state === "close" && connection.status === "CONNECTED") {
      // A sessão caiu por fora (aparelho desligado, "sair" pelo celular).
      // Vira PENDING_QR, não DISCONNECTED: DISCONNECTED significa "o usuário
      // desligou de propósito" e não deve ser inventado por uma queda.
      await this.prisma.whatsAppConnection.update({
        where: { instanceName },
        data: { status: "PENDING_QR" },
      });
    }
  }

  private async markConnected(connection: WhatsAppConnection): Promise<WhatsAppConnection> {
    const rawNumber = await this.evolution.getConnectedNumber(connection.instanceName!);

    return this.prisma.whatsAppConnection.update({
      where: { id: connection.id },
      data: {
        status: "CONNECTED",
        disconnectedAt: null,
        ...(rawNumber ? { displayPhoneNumber: normalizePhone(rawNumber) } : {}),
      },
    });
  }

  private async requireEvolutionConnection(organizationId: string): Promise<WhatsAppConnection> {
    const connection = await this.prisma.whatsAppConnection.findUnique({ where: { organizationId } });
    if (!connection || connection.provider !== "EVOLUTION" || !connection.instanceName) {
      throw new AppException(
        "NOT_CONNECTED",
        "Nenhuma conexão por QR Code encontrada. Inicie a conexão primeiro.",
        HttpStatus.NOT_FOUND,
      );
    }
    return connection;
  }

  private instanceNameFor(organizationId: string): string {
    return `org-${organizationId}`;
  }

  /**
   * O segredo compartilhado vai no path da URL registrada na Evolution — é
   * o que autentica os webhooks dela, que (ao contrário da Meta) não são
   * assinados. Ver `WhatsAppWebhookService.verifyEvolutionToken`.
   */
  private webhookUrl(): string {
    const url = process.env.EVOLUTION_WEBHOOK_URL;
    const token = process.env.EVOLUTION_WEBHOOK_TOKEN;
    if (!url || !token) {
      throw new AppException(
        "EVOLUTION_NOT_CONFIGURED",
        "EVOLUTION_WEBHOOK_URL/EVOLUTION_WEBHOOK_TOKEN não configuradas — a Evolution não teria para onde entregar as mensagens com segurança.",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return `${url.replace(/\/+$/, "")}/${encodeURIComponent(token)}`;
  }

  private redact<T extends { accessTokenEncrypted: string | null } | null>(
    connection: T,
  ): (Omit<NonNullable<T>, "accessTokenEncrypted"> & { hasAccessToken: boolean }) | null {
    if (!connection) return null;
    const { accessTokenEncrypted, ...rest } = connection;
    return { ...rest, hasAccessToken: Boolean(accessTokenEncrypted) };
  }
}
