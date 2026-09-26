import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../common/guards/platform-admin.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { RequiresPlatformRole } from "../common/decorators/platform-role.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { PaginationQueryDto } from "../common/dto/pagination.dto";
import { AdminService } from "./admin.service";
import { EntregaDeSessaoService } from "./entrega/entrega-de-sessao.service";
import { ListOrganizationsDto } from "./dto/list-organizations.dto";
import { UpsertOperatorDto } from "./dto/upsert-operator.dto";
import { CriaClienteDto } from "./dto/cria-cliente.dto";

/**
 * Rotas do operador da plataforma. A ordem dos guards importa: `JwtAuthGuard`
 * primeiro popula `request.user`, que é o que o `PlatformAdminGuard` lê para
 * conferir a flag no banco.
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly entregas: EntregaDeSessaoService,
  ) {}

  @Get("organizations")
  listOrganizations(@Query() query: ListOrganizationsDto) {
    return this.adminService.listOrganizations(query, query.search);
  }

  /** "Novo cliente": só a organização. Quem usa a conta entra pelo link do WhatsApp ou pelo suporte. */
  @Post("organizations")
  criaCliente(@CurrentUser() user: AuthenticatedUser, @Body() dto: CriaClienteDto) {
    return this.adminService.criaCliente(user.userId, dto.nome, dto.cor);
  }

  @Get("organizations/:id/whatsapp")
  whatsappDoCliente(@Param("id", ParseUUIDPipe) id: string) {
    return this.adminService.whatsappDoCliente(id);
  }

  @Post("organizations/:id/whatsapp/link")
  geraLinkDoWhatsApp(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.adminService.geraLinkDoWhatsApp(user.userId, id);
  }

  @Post("organizations/:id/whatsapp/desconectar")
  @HttpCode(HttpStatus.NO_CONTENT)
  desconectaWhatsApp(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string): Promise<void> {
    return this.adminService.desconectaWhatsApp(user.userId, id);
  }

  @Post("organizations/:id/impersonate")
  impersonate(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.adminService.impersonate(user.userId, id);
  }

  /**
   * Entrar num cliente a partir do site da administração.
   *
   * Devolve um código de uso único, e não os tokens: a administração vive
   * noutra origem e não consegue gravar cookie para o site do cliente. Ela
   * manda o navegador para lá com o código, e é lá que ele vira sessão.
   *
   * Separada de `impersonate` em vez de substituí-la: aquela continua sendo o
   * contrato de quem já a usa, e trocar a forma de uma rota existente
   * quebraria consumidor sem aviso.
   */
  @Post("organizations/:id/entrada")
  async entrada(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    const sessao = await this.adminService.impersonate(user.userId, id);
    return {
      organization: sessao.organization,
      entrega: await this.entregas.cria({
        accessToken: sessao.accessToken,
        refreshToken: sessao.refreshToken,
      }),
    };
  }

  @Get("impersonations")
  listImpersonations(@Query() pagination: PaginationQueryDto) {
    return this.adminService.listImpersonations(pagination);
  }

  // --- Gestão de operadores: exclusiva de ADMIN (Fase 9.2) ---------------

  @Get("operators")
  @RequiresPlatformRole("ADMIN")
  listOperators() {
    return this.adminService.listOperators();
  }

  /** Promove um usuário existente a operador, ou muda o nível de quem já é. */
  @Put("operators")
  @RequiresPlatformRole("ADMIN")
  upsertOperator(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpsertOperatorDto) {
    return this.adminService.upsertOperator(user.userId, dto);
  }

  @Delete("operators/:id")
  @RequiresPlatformRole("ADMIN")
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeOperator(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    await this.adminService.revokeOperator(user.userId, id);
  }
}
