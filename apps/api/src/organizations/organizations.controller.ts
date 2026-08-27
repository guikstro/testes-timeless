import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { OrganizationsService } from "./organizations.service";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";

@Controller("organizations")
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get("current")
  getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.getCurrent(user.organizationId);
  }

  @Patch("current")
  updateCurrent(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.updateCurrent(user.organizationId, dto);
  }

  /** Quem da equipe da plataforma entrou nesta conta — visível para o próprio cliente. */
  @Get("current/support-accesses")
  listSupportAccesses(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.listSupportAccesses(user.organizationId);
  }
}
