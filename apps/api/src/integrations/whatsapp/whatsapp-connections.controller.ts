import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { WhatsAppConnectionsService } from "./whatsapp-connections.service";
import { ConnectWhatsAppDto } from "./dto/connect-whatsapp.dto";
import { AuditoriaService, autorDe } from "../../auditoria/auditoria.service";
import { RegraDeLeadsDto } from "./dto/regra-de-leads.dto";

@Controller("integrations/whatsapp")
@UseGuards(JwtAuthGuard)
export class WhatsAppConnectionsController {
  constructor(
    private readonly whatsappConnectionsService: WhatsAppConnectionsService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Manual @Res() only because Nest sends an empty body (not the JSON text
   * "null") when a handler's return value is null — confirmed this is
   * Nest's own response layer, not Express (which does serialize
   * res.json(null) as "null" correctly). An empty body isn't valid JSON, so
   * a frontend fetch's response.json() throws on it, which is exactly the
   * "no connection yet" case this endpoint exists to report.
   */
  @Get()
  async getCurrent(@CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const result = await this.whatsappConnectionsService.getCurrent(user.organizationId);
    res.json(result);
  }

  /**
   * Quem vira lead quando escreve, e quanto ficou de fora nos últimos trinta
   * dias. Fica aqui, e não nas configurações gerais, porque é uma decisão
   * sobre o que o WhatsApp conectado recebe.
   */
  @Get("regra")
  regra(@CurrentUser() user: AuthenticatedUser) {
    return this.whatsappConnectionsService.regra(user.organizationId);
  }

  /*
    A auditoria das integrações fica no controlador: o que ela precisa é o
    estado como a tela o vê, antes e depois, e isso é o que `getCurrent` e
    `regra` já devolvem, sem token nenhum.
  */
  @Patch("regra")
  async mudaRegra(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegraDeLeadsDto) {
    const antes = await this.whatsappConnectionsService.regra(user.organizationId);
    const depois = await this.whatsappConnectionsService.mudaRegra(user.organizationId, dto.origemDosLeads);
    if (antes.origemDosLeads !== depois.origemDosLeads) {
      await this.auditoria.registra(autorDe(user), {
        acao: "INTEGRATION_UPDATED",
        entidade: "Organization",
        entidadeId: user.organizationId,
        antes: { integracao: "WhatsApp", quemViraLead: antes.origemDosLeads },
        depois: { integracao: "WhatsApp", quemViraLead: depois.origemDosLeads },
      });
    }
    return depois;
  }

  @Post("connect")
  async connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectWhatsAppDto) {
    const conexao = await this.whatsappConnectionsService.connect(user.organizationId, dto);
    await this.auditoria.registra(autorDe(user), {
      acao: "INTEGRATION_CONNECTED",
      entidade: "WhatsAppConnection",
      entidadeId: conexao?.id ?? user.organizationId,
      depois: { integracao: "WhatsApp", forma: "API oficial", numero: conexao?.displayPhoneNumber ?? null },
    });
    return conexao;
  }

  /**
   * Fase 8: inicia (ou reinicia) uma conexão por QR Code e já devolve o primeiro QR.
   *
   * Registrado aqui, quando alguém pede o QR: a leitura no celular chega
   * depois, pelo webhook, sem pessoa nenhuma por trás para constar.
   */
  @Post("qr/connect")
  async connectViaQrCode(@CurrentUser() user: AuthenticatedUser) {
    const resultado = await this.whatsappConnectionsService.connectViaQrCode(user.organizationId);
    await this.auditoria.registra(autorDe(user), {
      acao: "INTEGRATION_CONNECTED",
      entidade: "WhatsAppConnection",
      entidadeId: user.organizationId,
      depois: { integracao: "WhatsApp", forma: "QR Code", status: "aguardando leitura" },
    });
    return resultado;
  }

  /**
   * QR atual + status. A UI chama isto em intervalos enquanto o status for
   * PENDING_QR, porque a Evolution rotaciona o código a cada ~30s.
   */
  @Get("qr")
  getQrCode(@CurrentUser() user: AuthenticatedUser) {
    return this.whatsappConnectionsService.getQrCode(user.organizationId);
  }

  @Post("disconnect")
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    const antes = await this.whatsappConnectionsService.getCurrent(user.organizationId);
    await this.whatsappConnectionsService.disconnect(user.organizationId);
    await this.auditoria.registra(autorDe(user), {
      acao: "INTEGRATION_DISCONNECTED",
      entidade: "WhatsAppConnection",
      entidadeId: antes?.id ?? user.organizationId,
      antes: { integracao: "WhatsApp", numero: antes?.displayPhoneNumber ?? null },
    });
  }
}
