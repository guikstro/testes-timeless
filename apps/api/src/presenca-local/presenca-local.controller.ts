import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Requer } from "../common/permissoes/requer.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { OverviewQueryDto } from "../analytics/dto/overview-query.dto";
import { PresencaLocalService } from "./presenca-local.service";

/** O painel de presença local: ligações, rotas e visitas vindas do Google. */
@Controller("presenca-local")
@UseGuards(JwtAuthGuard)
@Requer("analytics.read")
export class PresencaLocalController {
  constructor(private readonly presenca: PresencaLocalService) {}

  @Get()
  painel(@CurrentUser() user: AuthenticatedUser, @Query() query: OverviewQueryDto) {
    return this.presenca.painel(user.organizationId, query.days ?? 30);
  }
}
