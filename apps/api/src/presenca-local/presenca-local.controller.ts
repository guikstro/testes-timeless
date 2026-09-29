import { Controller, Get, HttpStatus, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Requer } from "../common/permissoes/requer.decorator";
import { AppException } from "../common/exceptions/app-exception";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { OverviewQueryDto } from "../analytics/dto/overview-query.dto";
import { CampanhasQueryDto } from "../analytics/dto/campanhas-query.dto";
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

  /** Cada campanha do Google num mês livre, com comparação, como a tela de campanhas de leads. */
  @Get("campanhas")
  campanhas(@CurrentUser() user: AuthenticatedUser, @Query() query: CampanhasQueryDto) {
    if (query.de > query.ate) {
      throw new AppException("VALIDATION_ERROR", "A data inicial não pode ser depois da final.", HttpStatus.BAD_REQUEST);
    }
    const comparacao = query.compararDe && query.compararAte ? { de: query.compararDe, ate: query.compararAte } : null;
    if (comparacao && comparacao.de > comparacao.ate) {
      throw new AppException(
        "VALIDATION_ERROR",
        "A data inicial da comparação não pode ser depois da final.",
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.presenca.campanhas(user.organizationId, { de: query.de, ate: query.ate }, comparacao);
  }
}
