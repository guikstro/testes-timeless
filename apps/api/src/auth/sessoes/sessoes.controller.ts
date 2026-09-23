import { Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../jwt-payload.interface";
import { SessoesService } from "./sessoes.service";

/**
 * As sessões de quem está logado.
 *
 * Nenhuma rota aceita id de usuário: todas agem sobre quem está autenticado.
 * Encerrar a sessão de outra pessoa não é uma permissão desta tela.
 */
@Controller("auth/sessoes")
@UseGuards(JwtAuthGuard)
export class SessoesController {
  constructor(private readonly sessoes: SessoesService) {}

  @Get()
  listar(@CurrentUser() user: AuthenticatedUser) {
    return this.sessoes.listar(user);
  }

  /** Encerra todas, menos esta. */
  @Delete()
  encerrarOutras(@CurrentUser() user: AuthenticatedUser) {
    return this.sessoes.encerrarOutras(user);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async encerrar(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.sessoes.encerrar(user, id);
  }
}
