import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { WhatsAppConnectionsService } from "./whatsapp-connections.service";
import { ConnectWhatsAppDto } from "./dto/connect-whatsapp.dto";

@Controller("integrations/whatsapp")
@UseGuards(JwtAuthGuard)
export class WhatsAppConnectionsController {
  constructor(private readonly whatsappConnectionsService: WhatsAppConnectionsService) {}

  @Get()
  getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.whatsappConnectionsService.getCurrent(user.organizationId);
  }

  @Post("connect")
  connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectWhatsAppDto) {
    return this.whatsappConnectionsService.connect(user.organizationId, dto);
  }

  @Post("disconnect")
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.whatsappConnectionsService.disconnect(user.organizationId);
  }
}
