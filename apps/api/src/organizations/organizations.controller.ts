import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { OrganizationsService } from "./organizations.service";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { UpdateMemberDto } from "./dto/update-member.dto";

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

  @Get("current/members")
  listMembers(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.listMembers(user.organizationId);
  }

  @Patch("current/members/:userId")
  updateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.organizationsService.updateMember(user, userId, dto.role);
  }

  @Delete("current/members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.organizationsService.removeMember(user, userId);
  }
}
