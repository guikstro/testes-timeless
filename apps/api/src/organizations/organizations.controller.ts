import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Requer } from "../common/permissoes/requer.decorator";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { OrganizationsService } from "./organizations.service";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { UpdateMemberDto } from "./dto/update-member.dto";
import { autorDe } from "../auditoria/auditoria.service";
import { EnviarLogoDto } from "./dto/enviar-logo.dto";
import { TransferePosseDto } from "./dto/transfere-posse.dto";
import { Throttle } from "@nestjs/throttler";
import { CREDENCIAL } from "../common/throttling/limites";

@Controller("organizations")
@UseGuards(JwtAuthGuard)
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Requer()
  @Get("current")
  getCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.getCurrent(user.organizationId);
  }

  @Requer("settings.manage")
  @Patch("current")
  updateCurrent(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateOrganizationDto) {
    return this.organizationsService.updateCurrent(autorDe(user), dto);
  }

  /** Quem da equipe da plataforma entrou nesta conta — visível para o próprio cliente. */
  @Requer("support_access.read")
  @Get("current/support-accesses")
  listSupportAccesses(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.listSupportAccesses(user.organizationId);
  }

  @Requer("member.read")
  @Get("current/members")
  listMembers(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.listMembers(user.organizationId);
  }

  @Requer("member.manage")
  @Patch("current/members/:userId")
  updateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
    @Body() dto: UpdateMemberDto,
  ) {
    return this.organizationsService.updateMember(user, userId, dto.role);
  }

  /**
   * Passa a posse da conta da equipe. Pede o código do autenticador, com
   * poucas tentativas: é o código que decide, e ele não pode ser chutado.
   */
  @Requer("owner.manage")
  @Post("current/transferir-posse")
  @Throttle({ default: CREDENCIAL })
  @HttpCode(HttpStatus.OK)
  transferePosse(@CurrentUser() user: AuthenticatedUser, @Body() dto: TransferePosseDto) {
    return this.organizationsService.transferePosse(user, dto.userId, dto.codigo);
  }

  @Requer("member.manage")
  @Delete("current/members/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("userId", ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.organizationsService.removeMember(user, userId);
  }

  @Requer("settings.manage")
  @Post("current/logo")
  enviarLogo(@CurrentUser() user: AuthenticatedUser, @Body() dto: EnviarLogoDto) {
    return this.organizationsService.enviarLogo(autorDe(user), dto.arquivo);
  }

  @Requer("settings.manage")
  @Delete("current/logo")
  removerLogo(@CurrentUser() user: AuthenticatedUser) {
    return this.organizationsService.removerLogo(autorDe(user));
  }
}
