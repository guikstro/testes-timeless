import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { PaginationQueryDto } from "../../common/dto/pagination.dto";
import { MetaConnectionsService } from "./meta-connections.service";
import { ConversionEventsService } from "./conversion-events.service";
import { ConnectMetaDto } from "./dto/connect-meta.dto";
import { ConnectMetaCapiDto } from "./dto/connect-meta-capi.dto";

@Controller("integrations/meta")
@UseGuards(JwtAuthGuard)
export class MetaConnectionsController {
  constructor(
    private readonly metaConnectionsService: MetaConnectionsService,
    private readonly conversionEventsService: ConversionEventsService,
  ) {}

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

  @Post("capi/connect")
  connectCapi(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConnectMetaCapiDto) {
    return this.metaConnectionsService.connectCapi(user.organizationId, dto);
  }

  @Get("conversion-events")
  listConversionEvents(@CurrentUser() user: AuthenticatedUser, @Query() pagination: PaginationQueryDto) {
    return this.conversionEventsService.list(user.organizationId, pagination);
  }
}
