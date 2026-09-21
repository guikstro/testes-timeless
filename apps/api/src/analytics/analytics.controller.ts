import { Controller, Get, HttpStatus, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { AnalyticsService } from "./analytics.service";
import { OverviewQueryDto } from "./dto/overview-query.dto";
import { CampanhasQueryDto } from "./dto/campanhas-query.dto";
import { AppException } from "../common/exceptions/app-exception";

@Controller("analytics")
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get("overview")
  overview(@CurrentUser() user: AuthenticatedUser, @Query() query: OverviewQueryDto) {
    return this.analyticsService.overview(user.organizationId, query.days ?? 30);
  }

  /** Desempenho por campanha em dois períodos livres, para comparar meses. */
  @Get("campanhas")
  campanhas(@CurrentUser() user: AuthenticatedUser, @Query() query: CampanhasQueryDto) {
    if (query.de > query.ate) {
      throw new AppException("VALIDATION_ERROR", "A data inicial não pode ser depois da final.", HttpStatus.BAD_REQUEST);
    }

    const comparacao =
      query.compararDe && query.compararAte ? { de: query.compararDe, ate: query.compararAte } : null;

    if (comparacao && comparacao.de > comparacao.ate) {
      throw new AppException(
        "VALIDATION_ERROR",
        "A data inicial da comparação não pode ser depois da final.",
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.analyticsService.desempenhoPorCampanha(
      user.organizationId,
      { de: query.de, ate: query.ate },
      comparacao,
    );
  }

  /**
   * Desempenho por anúncio: o que cada criativo custou e o que ele trouxe.
   *
   * Rota separada da de campanhas porque responde outra pergunta. A de
   * campanhas diz onde o dinheiro está indo; esta diz qual criativo desligar.
   */
  @Get("anuncios")
  anuncios(@CurrentUser() user: AuthenticatedUser, @Query() query: CampanhasQueryDto) {
    if (query.de > query.ate) {
      throw new AppException("VALIDATION_ERROR", "A data inicial não pode ser depois da final.", HttpStatus.BAD_REQUEST);
    }

    return this.analyticsService.desempenhoPorAnuncio(user.organizationId, { de: query.de, ate: query.ate });
  }
}
