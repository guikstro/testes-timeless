import { Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { MetaConnectionsService } from "./meta-connections.service";
import { ConnectMetaDto } from "./dto/connect-meta.dto";

@Controller("integrations/meta")
@UseGuards(JwtAuthGuard)
export class MetaConnectionsController {
  constructor(private readonly metaConnectionsService: MetaConnectionsService) {}

  /** See the identical note in WhatsAppConnectionsController — Nest sends an empty body, not "null", for a null return value. */
  @Get()
  async getCurrent(@CurrentUser() user: AuthenticatedUser, @Res() res: Response): Promise<void> {
    const result = await this.metaConnectionsService.getCurrent(user.organizationId);
    res.json(result);
  }

  @Post("connect")
  connect(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectMetaDto) {
    return this.metaConnectionsService.connect(user.organizationId, dto);
  }

  @Post("disconnect")
  @HttpCode(HttpStatus.NO_CONTENT)
  async disconnect(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.metaConnectionsService.disconnect(user.organizationId);
  }

  @Post("sync")
  @HttpCode(HttpStatus.NO_CONTENT)
  async sync(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.metaConnectionsService.triggerSync(user.organizationId);
  }
}
