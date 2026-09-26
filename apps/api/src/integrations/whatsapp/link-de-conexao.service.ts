import { HttpStatus, Injectable, OnModuleDestroy } from "@nestjs/common";
import { WhatsAppConnectionStatus } from "@prisma/client";
import type Redis from "ioredis";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AppException } from "../../common/exceptions/app-exception";
import { criaConexaoRedis } from "../../common/queue/redis-connection";
import { hashToken } from "../../common/utils/hash-token";
import { enderecoDaAplicacao } from "../../common/configuracao/ambiente";
import { AuditoriaService } from "../../auditoria/auditoria.service";
import { WhatsAppConnectionsService } from "./whatsapp-connections.service";

const VALIDADE_EM_SEGUNDOS = 24 * 60 * 60;

export interface LinkGerado {
  url: string;
  expiraEm: Date;
}

/** O que a página pública recebe: o mínimo para o cliente saber o que está conectando. */
export interface SituacaoPeloLink {
  organizacao: string;
  status: WhatsAppConnectionStatus;
  qrCodeBase64: string | null;
}

const chaveDoLink = (hash: string) => `whatsapp-link:${hash}`;
const chaveDaOrganizacao = (organizationId: string) => `whatsapp-link-org:${organizationId}`;

/**
 * Link temporário para o cliente conectar o WhatsApp sem login.
 *
 * - O token é aleatório e só o hash dele é guardado. Quem lê o Redis não
 *   consegue remontar o link.
 * - Um link ativo por organização: gerar outro invalida o anterior.
 * - Vale 24 h e deixa de valer quando a conexão abre (uso único).
 * - A organização sai do Redis, nunca da URL. Não há como apontar o link para
 *   outro cliente.
 */
@Injectable()
export class LinkDeConexaoService implements OnModuleDestroy {
  private readonly redis: Redis = criaConexaoRedis(LinkDeConexaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conexoes: WhatsAppConnectionsService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  async gera(organizationId: string): Promise<LinkGerado> {
    const token = randomBytes(32).toString("base64url");
    const hash = hashToken(token);
    const anterior = await this.redis.get(chaveDaOrganizacao(organizationId));

    const transacao = this.redis.multi();
    if (anterior) transacao.del(chaveDoLink(anterior));
    transacao.set(chaveDoLink(hash), organizationId, "EX", VALIDADE_EM_SEGUNDOS);
    transacao.set(chaveDaOrganizacao(organizationId), hash, "EX", VALIDADE_EM_SEGUNDOS);
    await transacao.exec();

    return {
      url: `${enderecoDaAplicacao()}/conectar-whatsapp/${token}`,
      expiraEm: new Date(Date.now() + VALIDADE_EM_SEGUNDOS * 1000),
    };
  }

  /** Quando o link ativo da organização vence, ou null se não há link. */
  async expiracao(organizationId: string): Promise<Date | null> {
    const segundos = await this.redis.ttl(chaveDaOrganizacao(organizationId));
    return segundos > 0 ? new Date(Date.now() + segundos * 1000) : null;
  }

  async encerra(organizationId: string): Promise<void> {
    const hash = await this.redis.get(chaveDaOrganizacao(organizationId));
    const chaves = [chaveDaOrganizacao(organizationId), ...(hash ? [chaveDoLink(hash)] : [])];
    await this.redis.del(...chaves);
  }

  /**
   * O que a página pública mostra. Na primeira visita inicia o QR; nas
   * seguintes só consulta. Organização já conectada não é tocada: reiniciar o
   * QR ali derrubaria o status de uma conexão ativa.
   */
  async situacao(token: string): Promise<SituacaoPeloLink> {
    const organizationId = await this.organizacaoDoLink(token);
    const organizacao = organizationId
      ? await this.prisma.organization.findFirst({ where: { id: organizationId, deletedAt: null }, select: { name: true } })
      : null;
    if (!organizationId || !organizacao) {
      throw new AppException("LINK_INVALIDO", "Este link é inválido ou já venceu. Peça um novo.", HttpStatus.NOT_FOUND);
    }

    const atual = await this.conexoes.getCurrent(organizationId);
    if (atual?.status === "CONNECTED") {
      await this.encerra(organizationId);
      return { organizacao: organizacao.name, status: "CONNECTED", qrCodeBase64: null };
    }

    const qr = atual?.provider === "EVOLUTION" && atual.status === "PENDING_QR"
      ? await this.conexoes.getQrCode(organizationId)
      : await this.iniciaPeloLink(organizationId);

    if (qr.status === "CONNECTED") await this.encerra(organizationId);
    return { organizacao: organizacao.name, status: qr.status, qrCodeBase64: qr.qrCodeBase64 };
  }

  private async organizacaoDoLink(token: string): Promise<string | null> {
    if (!token || token.length > 128) return null;
    return this.redis.get(chaveDoLink(hashToken(token)));
  }

  private async iniciaPeloLink(organizationId: string) {
    const qr = await this.conexoes.connectViaQrCode(organizationId);
    await this.auditoria.registra(
      { organizationId, userId: null },
      {
        acao: "INTEGRATION_CONNECTED",
        entidade: "WhatsAppConnection",
        entidadeId: organizationId,
        depois: { integracao: "WhatsApp", forma: "link externo", status: "aguardando leitura" },
      },
    );
    return qr;
  }
}
