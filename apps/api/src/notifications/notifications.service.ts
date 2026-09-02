import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { PrismaService } from "../common/prisma/prisma.service";
import { getRedisConnectionOptions } from "../common/queue/redis-connection";
import { canalDaOrganizacao, NotificationEvent } from "./notification-event";

/** Teto de uma página do histórico, para uma caixa antiga não virar uma consulta enorme. */
const POR_PAGINA = 30;

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly publicador: Redis;

  constructor(private readonly prisma: PrismaService) {
    this.publicador = new Redis(getRedisConnectionOptions());
  }

  async onModuleDestroy(): Promise<void> {
    await this.publicador.quit();
  }

  /**
   * Grava e anuncia um aviso.
   *
   * Nunca lança. Esta função é chamada de dentro da ingestão do WhatsApp, e
   * uma falha ao notificar não pode custar a mensagem do lead: perder o aviso
   * é um incômodo, perder a mensagem é perder o cliente. O erro vai para o
   * log e a ingestão segue.
   *
   * Grava antes de publicar, nessa ordem: se o Redis estiver fora, o aviso
   * ainda aparece no sino quando a pessoa abrir a tela. Ao contrário, um
   * aviso publicado e não gravado some para sempre de quem estava offline.
   */
  async notificar(evento: Omit<NotificationEvent, "timestamp"> & { timestamp?: string }): Promise<void> {
    const completo: NotificationEvent = { ...evento, timestamp: evento.timestamp ?? new Date().toISOString() };

    try {
      await this.persistir(completo);
    } catch (erro) {
      this.logger.error(
        JSON.stringify({ event: "notification_persist_failed", type: completo.type, error: String(erro) }),
      );
    }

    try {
      await this.publicador.publish(canalDaOrganizacao(completo.organizationId), JSON.stringify(completo));
    } catch (erro) {
      this.logger.error(
        JSON.stringify({ event: "notification_publish_failed", type: completo.type, error: String(erro) }),
      );
    }
  }

  /**
   * Uma linha por pessoa da organização.
   *
   * O estado de leitura pertence a quem lê. Com uma linha só para todos, o
   * primeiro operador a marcar como lida apagaria o aviso da caixa do colega.
   */
  private async persistir(evento: NotificationEvent): Promise<void> {
    const membros = await this.prisma.membership.findMany({
      where: { organizationId: evento.organizationId },
      select: { userId: true },
    });

    if (membros.length === 0) return;

    await this.prisma.notification.createMany({
      data: membros.map((membro) => ({
        organizationId: evento.organizationId,
        userId: membro.userId,
        type: evento.type,
        title: evento.title,
        body: evento.body ?? null,
        leadId: evento.leadId ?? null,
        createdAt: new Date(evento.timestamp),
      })),
    });
  }

  async listar(userId: string, opcoes: { antesDe?: string; tipo?: string; naoLidas?: boolean } = {}) {
    const where = {
      userId,
      ...(opcoes.tipo ? { type: opcoes.tipo } : {}),
      ...(opcoes.naoLidas ? { read: false } : {}),
      ...(opcoes.antesDe ? { createdAt: { lt: new Date(opcoes.antesDe) } } : {}),
    };

    // Pede uma linha a mais do que cabe na página só para saber se existe
    // próxima, sem pagar um count sobre a caixa inteira.
    const linhas = await this.prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: POR_PAGINA + 1,
    });

    const pagina = linhas.slice(0, POR_PAGINA);

    return {
      notificacoes: pagina,
      // Cursor é a data da última linha, e não um número de página: a caixa
      // recebe linhas novas no topo o tempo todo, e um offset saltaria itens.
      proximoCursor: linhas.length > POR_PAGINA ? pagina[pagina.length - 1].createdAt.toISOString() : null,
      naoLidas: await this.contarNaoLidas(userId),
    };
  }

  contarNaoLidas(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, read: false } });
  }

  /** O `userId` no filtro é o que impede marcar como lida a notificação de outra pessoa. */
  async marcarComoLida(userId: string, id: string): Promise<{ naoLidas: number }> {
    await this.prisma.notification.updateMany({ where: { id, userId }, data: { read: true } });
    return { naoLidas: await this.contarNaoLidas(userId) };
  }

  async marcarTodasComoLidas(userId: string): Promise<{ naoLidas: number }> {
    await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return { naoLidas: 0 };
  }
}
