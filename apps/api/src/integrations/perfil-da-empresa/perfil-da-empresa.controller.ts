import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../../common/guards/platform-admin.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequiresPlatformRole } from "../../common/decorators/platform-role.decorator";
import { AuthenticatedUser } from "../../auth/jwt-payload.interface";
import { ConcluiConexaoDto, DefineLocaisDto, IniciaConexaoDto } from "./dto/perfil-da-empresa.dto";
import { PerfilDaEmpresaService } from "./perfil-da-empresa.service";

/**
 * O Perfil da Empresa no Google, só para a equipe Timeless: as mesmas portas
 * da administração (operador com segundo fator, fora de uma visita a
 * cliente). Ligar e desligar a conta Google da equipe é de quem administra a
 * plataforma; escolher o perfil de um cliente, de qualquer operador.
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PerfilDaEmpresaController {
  constructor(private readonly servico: PerfilDaEmpresaService) {}

  @Get("perfil-da-empresa")
  situacao() {
    return this.servico.situacao();
  }

  @Post("perfil-da-empresa/inicio")
  @RequiresPlatformRole("ADMIN")
  @HttpCode(HttpStatus.OK)
  inicia(@CurrentUser() user: AuthenticatedUser, @Body() dto: IniciaConexaoDto) {
    return this.servico.inicia(user, dto.volta);
  }

  @Post("perfil-da-empresa/conexao")
  @RequiresPlatformRole("ADMIN")
  @HttpCode(HttpStatus.OK)
  conclui(@CurrentUser() user: AuthenticatedUser, @Body() dto: ConcluiConexaoDto) {
    return this.servico.conclui(user, dto.codigo, dto.estado);
  }

  @Delete("perfil-da-empresa")
  @RequiresPlatformRole("ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  async desconecta(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.servico.desconecta(user);
  }

  @Get("perfil-da-empresa/locais")
  locais() {
    return this.servico.locaisDisponiveis();
  }

  @Get("organizations/:id/perfil-da-empresa")
  doCliente(@Param("id", ParseUUIDPipe) id: string) {
    return this.servico.doCliente(id);
  }

  @Put("organizations/:id/perfil-da-empresa")
  @HttpCode(HttpStatus.NO_CONTENT)
  async defineLocais(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: DefineLocaisDto,
  ): Promise<void> {
    await this.servico.defineLocais(user, id, dto.locais);
  }

  @Post("organizations/:id/perfil-da-empresa/ler")
  @HttpCode(HttpStatus.ACCEPTED)
  async leAgora(@Param("id", ParseUUIDPipe) id: string): Promise<void> {
    await this.servico.leAgora(id);
  }
}
