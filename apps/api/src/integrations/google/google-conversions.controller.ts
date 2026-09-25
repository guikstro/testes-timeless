import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { AppException } from "../../common/exceptions/app-exception";
import { GoogleConversionsService } from "./google-conversions.service";
import { AuditoriaService, autorDe } from "../../auditoria/auditoria.service";
import { ExportacaoDto } from "./dto/exportacao.dto";
import { ListarConversoesDto } from "./dto/listar-conversoes.dto";

@Controller("integrations/google")
@UseGuards(JwtAuthGuard)
export class GoogleConversionsController {
  constructor(
    private readonly conversions: GoogleConversionsService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** O que precisa voltar para o Google Ads no período, pronto para virar arquivo. */
  @Get("conversions")
  listar(@CurrentUser() user: AuthenticatedUser, @Query() query: ListarConversoesDto) {
    if (query.de > query.ate) {
      throw new AppException("VALIDATION_ERROR", "A data inicial não pode ser depois da final.", HttpStatus.BAD_REQUEST);
    }
    return this.conversions.listar(user.organizationId, { de: query.de, ate: query.ate });
  }

  /**
   * Registra que a planilha foi baixada.
   *
   * O arquivo é montado no navegador, a partir da mesma lista que a tela
   * mostra, então o servidor não vê o download acontecer: a tela avisa aqui
   * no clique. Ler a lista não conta como exportar, porque ela também é a
   * prévia que aparece toda vez que a tela abre.
   */
  @Post("conversions/exportacao")
  @HttpCode(HttpStatus.NO_CONTENT)
  async exportacao(@CurrentUser() user: AuthenticatedUser, @Body() dto: ExportacaoDto): Promise<void> {
    await this.auditoria.registra(autorDe(user), {
      acao: "DATA_EXPORTED",
      entidade: "Organization",
      entidadeId: user.organizationId,
      depois: { arquivo: "conversões para o Google Ads", dias: dto.dias, linhas: dto.linhas },
    });
  }
}
