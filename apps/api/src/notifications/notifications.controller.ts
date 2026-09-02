import { Controller, Get, MessageEvent, Param, Patch, Post, Query, Sse, UseGuards } from "@nestjs/common";
import { interval, map, merge, Observable, of } from "rxjs";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { NotificationsGateway } from "./notifications.gateway";
import { NotificationsService } from "./notifications.service";
import { ListarNotificacoesDto } from "./dto/listar-notificacoes.dto";

/**
 * Um comentário a cada vinte e cinco segundos.
 *
 * Proxies e balanceadores fecham conexões ociosas, tipicamente em torno de um
 * minuto, e uma organização calma passa horas sem nenhum evento. Sem o
 * batimento, a tela ficaria com um cano morto que parece aberto.
 */
const BATIMENTO_MS = 25_000;

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(
    private readonly gateway: NotificationsGateway,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * O cano de tempo real.
   *
   * O `organizationId` sai do token, nunca da requisição: é o que impede
   * alguém de pedir o fluxo de outro cliente trocando um parâmetro.
   */
  @Sse("stream")
  stream(@CurrentUser() user: AuthenticatedUser): Observable<MessageEvent> {
    return merge(
      // O `retry` diz ao navegador em quanto tempo tentar de novo se a
      // conexão cair. O padrão dele é conservador; três segundos devolvem a
      // tela ao ar rápido depois de um deploy.
      of<MessageEvent>({ type: "ready", data: { ok: true }, retry: 3000 }),
      this.gateway.fluxo(user.organizationId).pipe(map((evento): MessageEvent => ({ data: evento }))),
      interval(BATIMENTO_MS).pipe(map((): MessageEvent => ({ type: "ping", data: "" }))),
    );
  }

  @Get()
  listar(@CurrentUser() user: AuthenticatedUser, @Query() query: ListarNotificacoesDto) {
    return this.notifications.listar(user.userId, {
      antesDe: query.antesDe,
      tipo: query.tipo,
      naoLidas: query.naoLidas,
    });
  }

  @Patch(":id/read")
  marcarComoLida(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.notifications.marcarComoLida(user.userId, id);
  }

  @Post("read-all")
  marcarTodasComoLidas(@CurrentUser() user: AuthenticatedUser) {
    return this.notifications.marcarTodasComoLidas(user.userId);
  }
}
