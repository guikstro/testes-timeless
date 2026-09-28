import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Requer } from "../common/permissoes/requer.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { BudgetsService } from "./budgets.service";
import { autorDe } from "../auditoria/auditoria.service";
import { SalvarVerbaDto } from "./dto/salvar-verba.dto";

@Controller("verbas")
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private readonly verbas: BudgetsService) {}

  /** A situação da verba que vale hoje. Null quando não há nenhuma declarada. */
  @Requer("budget.read")
  @Get("resumo")
  resumo(@CurrentUser() user: AuthenticatedUser) {
    return this.verbas.resumo(user.organizationId);
  }

  @Requer("budget.read")
  @Get()
  listar(@CurrentUser() user: AuthenticatedUser) {
    return this.verbas.listar(user.organizationId);
  }

  @Requer("budget.manage")
  @Post()
  criar(@CurrentUser() user: AuthenticatedUser, @Body() dto: SalvarVerbaDto) {
    return this.verbas.criar(autorDe(user), dto);
  }

  @Requer("budget.manage")
  @Patch(":id")
  atualizar(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: SalvarVerbaDto) {
    return this.verbas.atualizar(autorDe(user), id, dto);
  }

  @Requer("budget.manage")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remover(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string): Promise<void> {
    await this.verbas.remover(autorDe(user), id);
  }
}
