import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { NivelDoAnuncio } from "@prisma/client";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { ControleDeAnunciosService } from "./controle-de-anuncios.service";
import { MudarOrcamentoDto } from "./dto/controle-de-anuncios.dto";

/**
 * Escrita na conta de anúncios.
 *
 * Rotas separadas por nível, e não uma só recebendo o nível no corpo. Pausar
 * uma campanha derruba todos os conjuntos e anúncios dela: o alcance precisa
 * estar escrito na URL de quem chama, e aparecer assim no log de acesso.
 */
@Controller("controle-de-anuncios")
@UseGuards(JwtAuthGuard)
export class ControleDeAnunciosController {
  constructor(private readonly controle: ControleDeAnunciosService) {}

  @Post("campanhas/:externalId/pausar")
  pausarCampanha(@CurrentUser() user: AuthenticatedUser, @Param("externalId") externalId: string) {
    return this.controle.mudarStatus(user, NivelDoAnuncio.CAMPANHA, externalId, "PAUSED");
  }

  @Post("campanhas/:externalId/ativar")
  ativarCampanha(@CurrentUser() user: AuthenticatedUser, @Param("externalId") externalId: string) {
    return this.controle.mudarStatus(user, NivelDoAnuncio.CAMPANHA, externalId, "ACTIVE");
  }

  @Post("conjuntos/:externalId/pausar")
  pausarConjunto(@CurrentUser() user: AuthenticatedUser, @Param("externalId") externalId: string) {
    return this.controle.mudarStatus(user, NivelDoAnuncio.CONJUNTO, externalId, "PAUSED");
  }

  @Post("conjuntos/:externalId/ativar")
  ativarConjunto(@CurrentUser() user: AuthenticatedUser, @Param("externalId") externalId: string) {
    return this.controle.mudarStatus(user, NivelDoAnuncio.CONJUNTO, externalId, "ACTIVE");
  }

  @Post("anuncios/:externalId/pausar")
  pausarAnuncio(@CurrentUser() user: AuthenticatedUser, @Param("externalId") externalId: string) {
    return this.controle.mudarStatus(user, NivelDoAnuncio.ANUNCIO, externalId, "PAUSED");
  }

  @Post("anuncios/:externalId/ativar")
  ativarAnuncio(@CurrentUser() user: AuthenticatedUser, @Param("externalId") externalId: string) {
    return this.controle.mudarStatus(user, NivelDoAnuncio.ANUNCIO, externalId, "ACTIVE");
  }

  /** Orçamento diário só existe no conjunto. Ver `atualizarOrcamentoDiario`. */
  @Patch("conjuntos/:externalId/orcamento")
  orcamento(
    @CurrentUser() user: AuthenticatedUser,
    @Param("externalId") externalId: string,
    @Body() dto: MudarOrcamentoDto,
  ) {
    return this.controle.mudarOrcamentoDiario(user, externalId, dto.valorCentavos, dto.confirmarEstouro === true);
  }

  /**
   * O histórico é leitura, e por isso não passa por `podeEscreverNaConta`:
   * quem atende precisa poder ver que um anúncio foi pausado ontem, mesmo sem
   * poder pausar nenhum.
   */
  @Get("historico")
  historico(@CurrentUser() user: AuthenticatedUser) {
    return this.controle.historico(user.organizationId);
  }
}
