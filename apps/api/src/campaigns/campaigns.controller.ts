import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { AdPlatform } from "@prisma/client";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { CampaignsService } from "./campaigns.service";
import { CriarCampanhaManualDto, RegistrarGastoDto } from "./dto/manual-campaign.dto";
import { ImportarCsvDto, PreverCsvDto } from "./dto/importar-csv.dto";

@Controller("campaigns")
@UseGuards(JwtAuthGuard)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query("platform") platform?: AdPlatform) {
    // Sem plataforma devolve tudo, para não quebrar quem já consumia esta rota.
    if (platform === "META" || platform === "GOOGLE") {
      return this.campaignsService.listarPorPlataforma(user.organizationId, platform);
    }
    return this.campaignsService.list(user.organizationId);
  }

  /** Investimento agregado por campanha na janela, para o relatório do cliente. */
  @Get("investimento")
  investimento(@CurrentUser() user: AuthenticatedUser, @Query("days") days?: string) {
    const dias = Number(days);
    const janela = Number.isInteger(dias) && dias > 0 && dias <= 365 ? dias : 30;
    return this.campaignsService.investimentoNoPeriodo(user.organizationId, janela);
  }

  @Post("manual")
  criarManual(@CurrentUser() user: AuthenticatedUser, @Body() dto: CriarCampanhaManualDto) {
    return this.campaignsService.criarManual(user.organizationId, dto);
  }

  @Post(":id/spend")
  registrarGasto(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RegistrarGastoDto,
  ) {
    return this.campaignsService.registrarGasto(user.organizationId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removerManual(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.campaignsService.removerManual(user.organizationId, id);
  }

  @Post("csv/preview")
  @HttpCode(HttpStatus.OK)
  preverCsv(@Body() dto: PreverCsvDto) {
    return this.campaignsService.previewCsv(dto.conteudo);
  }

  @Post(":id/csv")
  @HttpCode(HttpStatus.OK)
  importarCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ImportarCsvDto,
  ) {
    return this.campaignsService.importarCsv(user.organizationId, id, dto.conteudo, dto.colunaData, dto.colunaValor);
  }
}
