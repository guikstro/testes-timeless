import { HttpStatus, Injectable } from "@nestjs/common";
import { WhatsAppConnection } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { AppException } from "../../common/exceptions/app-exception";
import { isUniqueConstraintError } from "../../common/utils/is-unique-constraint-error";
import { normalizePhone } from "../../common/utils/normalize-phone";
import { ConnectWhatsAppDto } from "./dto/connect-whatsapp.dto";
import { MotorWhatsApp } from "./motor-whatsapp";
import { OrigemDosLeads } from "@prisma/client";
import { hojeLocal } from "../../common/tempo";

/** A janela da contagem do que ficou fora da regra. */
const DIAS_DA_CONTAGEM = 30;

@Injectable()
export class WhatsAppConnectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly motor: MotorWhatsApp,
  ) {}

  async regra(organizationId: string) {
    const desde = new Date(`${hojeLocal()}T00:00:00.000Z`);
    desde.setUTCDate(desde.getUTCDate() - (DIAS_DA_CONTAGEM - 1));

    const [organizacao, fora] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { origemDosLeads: true },
      }),
      this.prisma.mensagemForaDaRegra.aggregate({
        where: { organizationId, dia: { gte: desde } },
        _sum: { quantidade: true },
      }),
    ]);

    return {
      origemDosLeads: organizacao.origemDosLeads,
      foraDaRegra: { dias: DIAS_DA_CONTAGEM, mensagens: fora._sum.quantidade ?? 0 },
    };
  }

  async mudaRegra(organizationId: string, origemDosLeads: OrigemDosLeads) {
    await this.prisma.organization.update({ where: { id: organizationId }, data: { origemDosLeads } });
    return this.regra(organizationId);
  }

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

    await this.motor.conecta(instanceName);

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
   * QR atual + status. O WhatsApp troca o código a cada ~20s, então a
   * UI chama isto repetidamente enquanto o status for PENDING_QR — e é aqui
   * que a leitura bem-sucedida do QR vira CONNECTED no nosso banco.
   */
  async getQrCode(organizationId: string) {
    const connection = await this.requireEvolutionConnection(organizationId);
    const state = this.motor.estado(connection.instanceName!);

    if (state === "open") {
      const updated = await this.markConnected(connection);
      return { status: updated.status, qrCodeBase64: null, displayPhoneNumber: updated.displayPhoneNumber };
    }

    const qr = await this.motor.qrCode(connection.instanceName!);
    return { status: "PENDING_QR" as const, qrCodeBase64: qr.base64, displayPhoneNumber: null };
  }

  async disconnect(organizationId: string): Promise<void> {
    const existing = await this.prisma.whatsAppConnection.findUnique({ where: { organizationId } });
    if (!existing) {
      throw new AppException("NOT_CONNECTED", "Nenhuma conexão de WhatsApp encontrada.", HttpStatus.NOT_FOUND);
    }

    if (existing.provider === "EVOLUTION" && existing.instanceName) {
      // Sem isto o aparelho continuaria pareado e as mensagens seguiriam chegando.
      await this.motor.desconecta(existing.instanceName);
    }

    // Só troca de status — nunca apaga a linha, para a chave de roteamento
    // continuar direcionando eventos atrasados à organização certa e o
    // histórico (conversas/leads) sobreviver a uma futura reconexão.
    await this.prisma.whatsAppConnection.update({
      where: { organizationId },
      data: { status: "DISCONNECTED", disconnectedAt: new Date() },
    });
  }

  /** Chamado pelos eventos de conexão do motor, não pela UI. */
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
    const rawNumber = this.motor.numeroConectado(connection.instanceName!);

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

  private redact<T extends { accessTokenEncrypted: string | null } | null>(
    connection: T,
  ): (Omit<NonNullable<T>, "accessTokenEncrypted"> & { hasAccessToken: boolean }) | null {
    if (!connection) return null;
    const { accessTokenEncrypted, ...rest } = connection;
    return { ...rest, hasAccessToken: Boolean(accessTokenEncrypted) };
  }
}
