import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { Observable, Subject } from "rxjs";
import { getRedisConnectionOptions } from "../common/queue/redis-connection";
import { canalDaOrganizacao, NotificationEvent } from "./notification-event";

interface Assinatura {
  assunto: Subject<NotificationEvent>;
  /** Quantas telas estão penduradas nesta organização agora. */
  conexoes: number;
}

/**
 * A ponte entre o Redis e as conexões abertas.
 *
 * O worker grava no banco e publica no Redis; a API é quem tem as conexões
 * dos navegadores. São processos separados, em contêineres separados, então
 * o Pub/Sub é o único caminho entre um e outro. O Redis já está no stack por
 * causa do BullMQ, então isto não acrescenta infraestrutura.
 *
 * A assinatura é por canal e sob demanda: a API só assina o canal de uma
 * organização enquanto houver alguém dela conectado. É o que garante o
 * isolamento entre clientes no lugar mais forte possível, que é não receber
 * o dado do outro, em vez de recebê-lo e confiar num filtro depois.
 *
 * A conexão do Redis é exclusiva: em modo de assinatura, o ioredis recusa
 * qualquer outro comando, então ela não pode ser a mesma do publicador nem a
 * do BullMQ.
 */
@Injectable()
export class NotificationsGateway implements OnModuleDestroy {
  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly assinante: Redis;
  private readonly porOrganizacao = new Map<string, Assinatura>();

  constructor() {
    this.assinante = new Redis(getRedisConnectionOptions());
    this.assinante.on("message", (canal, conteudo) => this.distribuir(canal, conteudo));
    this.assinante.on("error", (erro) =>
      this.logger.error(JSON.stringify({ event: "notifications_subscriber_error", error: String(erro) })),
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.assinante.quit();
  }

  /** Eventos de uma organização, enquanto alguém estiver ouvindo. */
  fluxo(organizationId: string): Observable<NotificationEvent> {
    return new Observable<NotificationEvent>((observador) => {
      const assinatura = this.entrar(organizationId);
      const interna = assinatura.assunto.subscribe(observador);

      return () => {
        interna.unsubscribe();
        this.sair(organizationId);
      };
    });
  }

  private entrar(organizationId: string): Assinatura {
    const existente = this.porOrganizacao.get(organizationId);
    if (existente) {
      existente.conexoes += 1;
      return existente;
    }

    const nova: Assinatura = { assunto: new Subject<NotificationEvent>(), conexoes: 1 };
    this.porOrganizacao.set(organizationId, nova);
    void this.assinante.subscribe(canalDaOrganizacao(organizationId));
    return nova;
  }

  private sair(organizationId: string): void {
    const assinatura = this.porOrganizacao.get(organizationId);
    if (!assinatura) return;

    assinatura.conexoes -= 1;
    if (assinatura.conexoes > 0) return;

    // Última tela daquele cliente fechou: solta o canal e o Subject, ou o
    // Map cresceria uma entrada por organização que já passou por aqui.
    this.porOrganizacao.delete(organizationId);
    assinatura.assunto.complete();
    void this.assinante.unsubscribe(canalDaOrganizacao(organizationId));
  }

  private distribuir(canal: string, conteudo: string): void {
    const assinatura = this.porOrganizacao.get(canal.slice("notifications:".length));
    if (!assinatura) return;

    try {
      assinatura.assunto.next(JSON.parse(conteudo) as NotificationEvent);
    } catch (erro) {
      // Conteúdo ilegível no canal: descartar é melhor que derrubar o fluxo
      // de todo mundo daquela organização por causa de uma mensagem só.
      this.logger.warn(JSON.stringify({ event: "notification_payload_invalid", error: String(erro) }));
    }
  }
}
