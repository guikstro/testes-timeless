import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { WhatsAppConnectionsService } from "./whatsapp-connections.service";
import { ConnectWhatsAppDto } from "./dto/connect-whatsapp.dto";
import { RegraDeLeadsDto } from "./dto/regra-de-leads.dto";

@Controller("integrations/whatsapp")
@UseGuards(JwtAuthGuard)
export class WhatsAppConnectionsController {
  constructor(private readonly whatsappConnectionsService: WhatsAppConnectionsService) {}

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

  @Patch("regra")
  mudaRegra(@CurrentUser() user: AuthenticatedUser, @Body() dto: RegraDeLeadsDto) {
    return this.whatsappConnectionsService.mudaRegra(user.organizationId, dto.origemDosLeads);
  }

  @Post("connect")
  connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectWhatsAppDto) {
    return this.whatsappConnectionsService.connect(user.organizationId, dto);
  }

  /** Fase 8: inicia (ou reinicia) uma conexão por QR Code e já devolve o primeiro QR. */
  @Post("qr/connect")
  connectViaQrCode(@CurrentUser() user: AuthenticatedUser) {
    return this.whatsappConnectionsService.connectViaQrCode(user.organizationId);
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
    await this.whatsappConnectionsService.disconnect(user.organizationId);
  }
}
