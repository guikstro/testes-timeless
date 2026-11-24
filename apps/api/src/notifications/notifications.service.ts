import { HttpStatus, Injectable, Logger, OnModuleDestroy, Optional } from "@nestjs/common";
import Redis from "ioredis";
import { PrismaService } from "../common/prisma/prisma.service";
import { criaConexaoRedis } from "../common/queue/redis-connection";
import { canalDaOrganizacao, NotificationEvent } from "./notification-event";
import { AppException } from "../common/exceptions/app-exception";
import { PushService } from "./push.service";
import { ProvedorDeEmail } from "../common/email/provedor-de-email";

/** Só o que pede atenção de quem está longe da tela vira aviso no aparelho. */
const TIPOS_COM_PUSH = new Set<NotificationEvent["type"]>(["lead.created", "message.received"]);

/** O que também vai para o canal externo (celular, mesmo com o painel fechado). */
const TIPOS_EXTERNOS = new Set<NotificationEvent["type"]>(["lead.created", "sistema.erro"]);

/**
 * Canal externo opcional, sem conta nem custo: com `AVISO_EXTERNO_URL` (ex.:
 * https://ntfy.sh/um-nome-dificil-de-adivinhar), cada lead novo e cada queda
 * do WhatsApp viram uma notificação no app ntfy do celular. Nunca lança.
 */
export async function avisoExterno(evento: Pick<NotificationEvent, "type" | "title" | "body">): Promise<void> {
  const url = process.env.AVISO_EXTERNO_URL?.trim();
  if (!url || !TIPOS_EXTERNOS.has(evento.type)) return;
  try {
    // Título dentro do corpo: cabeçalhos HTTP não aceitam acento.
    await fetch(url, {
      method: "POST",
      headers: { Priority: evento.type === "sistema.erro" ? "high" : "default" },
      body: evento.body && evento.body !== evento.title ? `${evento.title}\n${evento.body}` : evento.title,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    /* sem rede ou canal fora do ar: o aviso do sino já foi dado */
  }
}

/** De quem é a caixa: a pessoa, dentro da organização da sessão. */
export interface DonoDaCaixa {
  userId: string;
  organizationId: string;
}

/** Teto de uma página do histórico, para uma caixa antiga não virar uma consulta enorme. */
const POR_PAGINA = 30;

@Injectable()
export class NotificationsService implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly publicador: Redis;

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly push?: PushService,
    @Optional() private readonly email?: ProvedorDeEmail,
  ) {
    this.publicador = criaConexaoRedis("NotificationsService");
  }

  /**
   * E-mail para a equipe: lead novo e queda do WhatsApp, só para os endereços
   * de `AVISO_EMAIL_PARA` (separados por vírgula). Sem a variável, não faz nada.
   * Nunca lança: o aviso do sino já foi dado.
   */
  private async avisoPorEmail(evento: NotificationEvent): Promise<void> {
    const destinos = process.env.AVISO_EMAIL_PARA?.split(",").map((e) => e.trim()).filter(Boolean) ?? [];
    if (!this.email || destinos.length === 0 || !TIPOS_EXTERNOS.has(evento.type)) return;
    const painel = (process.env.WEB_APP_URL?.split(",")[0] ?? "").trim();
    const link = painel && evento.leadId ? `\n\nAbrir a conversa: ${painel}/conversas?lead=${evento.leadId}` : "";
    const texto = `${evento.title}${evento.body && evento.body !== evento.title ? `\n\n${evento.body}` : ""}${link}`;
    for (const para of destinos) {
      try {
        await this.email.enviar({ para, assunto: evento.title, texto });
      } catch (erro) {
        this.logger.warn(JSON.stringify({ event: "aviso_por_email_falhou", error: String(erro).slice(0, 160) }));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Encerrar uma conexão que já está caindo não pode derrubar o
    // desligamento: o `quit` rejeita os comandos pendentes, e essa rejeição
    // sem dono aborta o processo inteiro no meio da saída.
    await this.publicador.quit().catch(() => undefined);
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

    void avisoExterno(completo);
    void this.avisoPorEmail(completo);

    if (this.push && TIPOS_COM_PUSH.has(completo.type)) {
      await this.push.enviarParaOrganizacao(
        completo.organizationId,
        {
          title: completo.title,
          body: completo.body,
          url: completo.leadId ? `/conversas?lead=${completo.leadId}` : "/conversas",
          tag: completo.leadId ? `lead-${completo.leadId}` : undefined,
        },
        completo.type as "lead.created" | "message.received",
      );
    }
  }

  /**
   * Só avisa as telas abertas, sem gravar na caixa do sino.
   *
   * Para fatos que não são novidade para ninguém, como uma resposta que a
   * própria equipe acabou de dar: a conversa aberta precisa se atualizar, mas
   * um cartão e um número no sino seriam ruído. Nunca lança, pelo mesmo
   * motivo de `notificar`.
   */
  async anunciar(evento: Omit<NotificationEvent, "timestamp"> & { timestamp?: string }): Promise<void> {
    const completo: NotificationEvent = { ...evento, timestamp: evento.timestamp ?? new Date().toISOString() };
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

  /*
    Pessoa E organização em toda consulta, e não só a pessoa.

    Filtrava só pela pessoa, e ela pode fazer parte de mais de uma
    organização, ou ter saído de uma: quem era removido de um cliente
    continuava lendo, na sessão de outro, as notificações antigas do primeiro,
    com nome de lead e trecho de mensagem. A caixa agora é a da organização
    da sessão.
  */
  async listar(dono: DonoDaCaixa, opcoes: { antesDe?: string; tipo?: string; naoLidas?: boolean } = {}) {
    const where = {
      userId: dono.userId,
      organizationId: dono.organizationId,
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
      naoLidas: await this.contarNaoLidas(dono),
    };
  }

  contarNaoLidas(dono: DonoDaCaixa): Promise<number> {
    return this.prisma.notification.count({
      where: { userId: dono.userId, organizationId: dono.organizationId, read: false },
    });
  }

  /**
   * Pessoa e organização no filtro: é o que impede marcar como lida a
   * notificação de outra pessoa, ou a de outra organização. Não achar é 404,
   * e não um sucesso silencioso, para quem tenta um id alheio não ter como
   * distinguir "não é seu" de "não existe".
   */
  async marcarComoLida(dono: DonoDaCaixa, id: string): Promise<{ naoLidas: number }> {
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId: dono.userId, organizationId: dono.organizationId },
      data: { read: true },
    });
    if (count === 0) {
      throw new AppException("NAO_ENCONTRADA", "Notificação não encontrada.", HttpStatus.NOT_FOUND);
    }
    return { naoLidas: await this.contarNaoLidas(dono) };
  }

  async marcarTodasComoLidas(dono: DonoDaCaixa): Promise<{ naoLidas: number }> {
    await this.prisma.notification.updateMany({
      where: { userId: dono.userId, organizationId: dono.organizationId, read: false },
      data: { read: true },
    });
    return { naoLidas: 0 };
  }
}
