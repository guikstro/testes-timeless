import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { AuditoriaService } from "./auditoria.service";
import { ListarAuditoriaDto } from "./dto/listar-auditoria.dto";
import { CATEGORIAS } from "./categorias";

@Controller("auditoria")
@UseGuards(JwtAuthGuard)
export class AuditoriaController {
  constructor(private readonly auditoria: AuditoriaService) {}

  @Get()
  listar(@CurrentUser() user: AuthenticatedUser, @Query() filtro: ListarAuditoriaDto) {
    return this.auditoria.listar(user, filtro);
  }

  @Get("pessoas")
  pessoas(@CurrentUser() user: AuthenticatedUser) {
    return this.auditoria.pessoas(user);
  }

  /** Os grupos do filtro, com o rótulo de cada um. */
  @Get("categorias")
  categorias() {
    return Object.entries(CATEGORIAS).map(([chave, { rotulo }]) => ({ chave, rotulo }));
  }
}
