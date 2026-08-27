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
import { ListOrganizationsDto } from "./dto/list-organizations.dto";
import { UpsertOperatorDto } from "./dto/upsert-operator.dto";

/**
 * Rotas do operador da plataforma. A ordem dos guards importa: `JwtAuthGuard`
 * primeiro popula `request.user`, que é o que o `PlatformAdminGuard` lê para
 * conferir a flag no banco.
 */
@Controller("admin")
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get("organizations")
  listOrganizations(@Query() query: ListOrganizationsDto) {
    return this.adminService.listOrganizations(query, query.search);
  }

  @Post("organizations/:id/impersonate")
  impersonate(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.adminService.impersonate(user.userId, id);
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
