import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";
import { MetaConnectionsService } from "./meta-connections.service";
import { ConversionEventsService } from "./conversion-events.service";
import { ConnectMetaDto } from "./dto/connect-meta.dto";
import { AuditoriaService, autorDe } from "../../auditoria/auditoria.service";
import { ConnectMetaCapiDto } from "./dto/connect-meta-capi.dto";

@Controller("integrations/meta")
@UseGuards(JwtAuthGuard)
export class MetaConnectionsController {
  constructor(
    private readonly metaConnectionsService: MetaConnectionsService,
    private readonly conversionEventsService: ConversionEventsService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** See the identical note in WhatsAppConnectionsController — Nest sends an empty body, not "null", for a null return value. */
  @Get()
  async getCurrent(@CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const result = await this.metaConnectionsService.getCurrent(user.organizationId);
    res.json(result);
  }

  /**
   * A saúde da conta: estado, teto de gasto e saldo, como a Meta reporta.
   *
   * Rota separada da conexão porque responde outra pergunta. A de conexão diz
   * se o vínculo existe; esta diz se o dinheiro do outro lado está de pé.
   */
  @Get("saude")
  saude(@CurrentUser() user: AuthenticatedUser) {
    return this.metaConnectionsService.saudeDaConta(user.organizationId);
  }

  /*
    A auditoria das integrações fica aqui, e não no serviço: o que ela precisa
    é o estado antes e depois como a tela o vê, que é o mesmo que `getCurrent`
    devolve, já sem token nenhum.
  */
  @Post("connect")
  async connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectMetaDto) {
    const antes = await this.metaConnectionsService.getCurrent(user.organizationId);
    const conexao = await this.metaConnectionsService.connect(user.organizationId, dto);
    await this.auditoria.registra(autorDe(user), {
      acao: "INTEGRATION_CONNECTED",
      entidade: "MetaConnection",
      entidadeId: conexao?.id ?? user.organizationId,
      antes: antes ? { integracao: "Meta Ads", contaDeAnuncios: antes.adAccountId, status: antes.status } : null,
      depois: { integracao: "Meta Ads", contaDeAnuncios: conexao?.adAccountId ?? null, status: conexao?.status ?? null },
    });
    return conexao;
  }

  @Post("disconnect")
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    const antes = await this.metaConnectionsService.getCurrent(user.organizationId);
    await this.metaConnectionsService.disconnect(user.organizationId);
    await this.auditoria.registra(autorDe(user), {
      acao: "INTEGRATION_DISCONNECTED",
      entidade: "MetaConnection",
      entidadeId: antes?.id ?? user.organizationId,
      antes: { integracao: "Meta Ads", contaDeAnuncios: antes?.adAccountId ?? null },
    });
  }

  @Post("sync")
  @HttpCode(HttpStatus.NO_CONTENT)
  async sync(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.metaConnectionsService.triggerSync(user.organizationId);
  }

  @Post("capi/connect")
  async connectCapi(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectMetaCapiDto) {
    const antes = await this.metaConnectionsService.getCurrent(user.organizationId);
    const conexao = await this.metaConnectionsService.connectCapi(user.organizationId, dto);
    await this.auditoria.registra(autorDe(user), {
      acao: "INTEGRATION_UPDATED",
      entidade: "MetaConnection",
      entidadeId: conexao?.id ?? user.organizationId,
      antes: { integracao: "Meta API de Conversões", pixel: antes?.pixelId ?? null },
      depois: { integracao: "Meta API de Conversões", pixel: conexao?.pixelId ?? null },
    });
    return conexao;
  }

  @Get("conversion-events")
  listConversionEvents(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.conversionEventsService.list(user.organizationId, pagination);
  }
}
