import { Injectable, Logger } from "@nestjs/common";
import * as webpush from "web-push";
import { PrismaService } from "../common/prisma/prisma.service";
import { EncryptionService } from "../common/encryption/encryption.service";
import { isUniqueConstraintError } from "../common/utils/is-unique-constraint-error";

export interface AvisoDePush {
  title: string;
  body?: string;
  /** Para onde o clique leva. */
  url: string;
  /** Avisos do mesmo lead se substituem em vez de empilhar. */
  tag?: string;
}

export interface InscricaoDoNavegador {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

interface ChavesVapid {
  publicKey: string;
  privateKey: string;
}

/**
 * Avisos de mensagem nova no aparelho, mesmo com o sistema fechado (Web Push).
 *
 * As chaves VAPID nascem aqui, na primeira vez que são precisas, e ficam no
 * banco com a chave privada criptografada. Assim nenhuma variável de ambiente
 * precisa ser configurada para o recurso existir.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private chaves: Promise<ChavesVapid> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async chavePublica(): Promise<string> {
    return (await this.obterChaves()).publicKey;
  }

  async inscrever(
    user: { userId: string; organizationId: string },
    inscricao: InscricaoDoNavegador,
    userAgent?: string,
  ): Promise<void> {
    // O mesmo aparelho pode trocar de pessoa ou de organização: o endereço é a
    // identidade, e a última pessoa a ativar é quem passa a receber.
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: inscricao.endpoint },
      create: {
        organizationId: user.organizationId,
        userId: user.userId,
        endpoint: inscricao.endpoint,
        p256dh: inscricao.keys.p256dh,
        auth: inscricao.keys.auth,
        userAgent: userAgent?.slice(0, 300),
      },
      update: {
        organizationId: user.organizationId,
        userId: user.userId,
        p256dh: inscricao.keys.p256dh,
        auth: inscricao.keys.auth,
        userAgent: userAgent?.slice(0, 300),
      },
    });
  }

  async cancelar(user: { userId: string; organizationId: string }, endpoint: string): Promise<void> {
    await this.prisma.pushSubscription.deleteMany({
      where: { endpoint, userId: user.userId, organizationId: user.organizationId },
    });
  }

  /**
   * Manda o aviso a todos os aparelhos da organização. Nunca lança: é chamado
   * de dentro da ingestão, e perder um aviso não pode custar a mensagem.
   */
  async enviarParaOrganizacao(organizationId: string, aviso: AvisoDePush): Promise<void> {
    try {
      const inscricoes = await this.prisma.pushSubscription.findMany({ where: { organizationId } });
      if (inscricoes.length === 0) return;

      const { publicKey, privateKey } = await this.obterChaves();
      const carga = JSON.stringify(aviso);
      const opcoes = {
        vapidDetails: { subject: process.env.VAPID_SUBJECT ?? "mailto:suporte@timeless.app", publicKey, privateKey },
        TTL: 60 * 60,
        urgency: "high" as const,
      };

      await Promise.all(
        inscricoes.map(async (inscricao) => {
          try {
            await webpush.sendNotification(
              { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.p256dh, auth: inscricao.auth } },
              carga,
              opcoes,
            );
          } catch (erro) {
            const status = (erro as { statusCode?: number }).statusCode;
            // 404/410: o aparelho desativou os avisos ou desinstalou. Esquecer.
            if (status === 404 || status === 410) {
              await this.prisma.pushSubscription.deleteMany({ where: { id: inscricao.id } });
              return;
            }
            this.logger.warn(JSON.stringify({ event: "push_falhou", status, erro: String(erro).slice(0, 200) }));
          }
        }),
      );
    } catch (erro) {
      this.logger.error(JSON.stringify({ event: "push_erro", erro: String(erro).slice(0, 200) }));
    }
  }

  private obterChaves(): Promise<ChavesVapid> {
    if (!this.chaves) {
      this.chaves = this.carregarOuGerar().catch((erro) => {
        // Não guarda a falha: a próxima chamada tenta de novo.
        this.chaves = null;
        throw erro;
      });
    }
    return this.chaves;
  }

  private async carregarOuGerar(): Promise<ChavesVapid> {
    const existente = await this.prisma.pushConfig.findUnique({ where: { id: 1 } });
    if (existente) {
      return { publicKey: existente.publicKey, privateKey: this.encryption.decrypt(existente.privateKeyEnc) };
    }

    const gerada = webpush.generateVAPIDKeys();
    try {
      await this.prisma.pushConfig.create({
        data: { id: 1, publicKey: gerada.publicKey, privateKeyEnc: this.encryption.encrypt(gerada.privateKey) },
      });
      return gerada;
    } catch (erro) {
      if (!isUniqueConstraintError(erro)) throw erro;
      // Outro processo gerou primeiro (API e worker): vale o dele.
      const vencedora = await this.prisma.pushConfig.findUniqueOrThrow({ where: { id: 1 } });
      return { publicKey: vencedora.publicKey, privateKey: this.encryption.decrypt(vencedora.privateKeyEnc) };
    }
  }
}
