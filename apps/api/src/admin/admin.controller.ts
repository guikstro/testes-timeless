import { Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { PlatformAdminGuard } from "../common/guards/platform-admin.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { PaginationQueryDto } from "../common/dto/pagination.dto";
import { AdminService } from "./admin.service";
import { ListOrganizationsDto } from "./dto/list-organizations.dto";

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
}
