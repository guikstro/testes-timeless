import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { MembershipRole } from "@prisma/client";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * organizationId always comes from the authenticated JWT, never from a
   * client-supplied param — this is what makes cross-tenant access
   * structurally impossible rather than merely checked.
   */
  async getCurrent(organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!organization) {
      throw new AppException("NOT_FOUND", "Organização não encontrada.", HttpStatus.NOT_FOUND);
    }
    return organization;
  }

  async updateCurrent(organizationId: string, dto: UpdateOrganizationDto) {
    await this.getCurrent(organizationId);
    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...dto,
        // String vazia é "remover", não "gravar vazio": é assim que o campo
        // volta ao padrão depois de ter sido preenchido.
        ...(dto.logoUrl === "" ? { logoUrl: null } : {}),
        ...(dto.brandColor === "" ? { brandColor: null } : {}),
      },
    });
  }

  /**
   * Acessos da equipe da plataforma a ESTA organização (Fase 9).
   *
   * Deliberadamente visível para o próprio cliente, e não só no painel
   * interno: um acesso aos dados de alguém que só quem acessou consegue
   * revisar não é transparência de verdade. Escopado por `organizationId`
   * como todo o resto — um cliente nunca enxerga os acessos de outro.
   */
  async listSupportAccesses(organizationId: string) {
    return this.prisma.auditLog.findMany({
      where: { organizationId, action: "IMPERSONATION_STARTED" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        // Nome e e-mail de quem entrou; nunca o id interno do operador.
        user: { select: { name: true, email: true } },
      },
    });
  }

  /** Quem está na organização. Todo mundo de dentro pode ver com quem divide a conta. */
  async listMembers(organizationId: string) {
    const membros = await this.prisma.membership.findMany({
      where: { organizationId, user: { deletedAt: null } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } },
      },
    });

    return membros.map((membro) => ({
      userId: membro.user.id,
      name: membro.user.name,
      email: membro.user.email,
      role: membro.role,
      joinedAt: membro.createdAt,
    }));
  }

  /**
   * Troca o papel de alguém.
   *
   * As travas não são burocracia: cada uma existe para um jeito concreto de
   * ficar sem dono. Rebaixar a si mesmo tira o seu próprio acesso à gestão da
   * conta; rebaixar o último dono deixa a organização sem ninguém que possa
   * promover alguém depois.
   */
  async updateMember(
    quem: AuthenticatedUser,
    alvoUserId: string,
    role: MembershipRole,
  ) {
    this.exigeGestao(quem);
    const alvo = await this.membroOuErro(quem.organizationId, alvoUserId);

    if (alvoUserId === quem.userId) {
      throw new AppException(
        "CANNOT_CHANGE_OWN_ROLE",
        "Você não pode mudar o seu próprio papel.",
        HttpStatus.BAD_REQUEST,
      );
    }
    if (quem.role === "ADMIN" && (alvo.role === "OWNER" || role === "OWNER")) {
      throw new AppException(
        "OWNER_REQUIRED",
        "Só um dono pode promover ou rebaixar outro dono.",
        HttpStatus.FORBIDDEN,
      );
    }
    if (alvo.role === "OWNER" && role !== "OWNER") {
      await this.exigeOutroDono(quem.organizationId, alvoUserId);
    }

    await this.prisma.membership.update({
      where: { organizationId_userId: { organizationId: quem.organizationId, userId: alvoUserId } },
      data: { role },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: quem.organizationId,
        userId: quem.userId,
        entity: "Membership",
        entityId: alvoUserId,
        action: "MEMBER_ROLE_CHANGED",
        before: { role: alvo.role },
        after: { role },
      },
    });

    return { userId: alvoUserId, role };
  }

  /**
   * Tira alguém da organização.
   *
   * Remove o vínculo, não a pessoa: a conta dela continua existindo, e os
   * leads, mensagens e registros de auditoria que apontam para ela seguem
   * inteiros. Apagar o usuário reescreveria o histórico de quem fez o quê.
   */
  async removeMember(quem: AuthenticatedUser, alvoUserId: string): Promise<void> {
    this.exigeGestao(quem);
    const alvo = await this.membroOuErro(quem.organizationId, alvoUserId);

    if (alvoUserId === quem.userId) {
      throw new AppException(
        "CANNOT_REMOVE_SELF",
        "Você não pode remover a si mesmo. Peça a outro dono.",
        HttpStatus.BAD_REQUEST,
      );
    }
    if (quem.role === "ADMIN" && alvo.role === "OWNER") {
      throw new AppException("OWNER_REQUIRED", "Só um dono pode remover outro dono.", HttpStatus.FORBIDDEN);
    }
    if (alvo.role === "OWNER") {
      await this.exigeOutroDono(quem.organizationId, alvoUserId);
    }

    await this.prisma.$transaction([
      this.prisma.membership.delete({
        where: { organizationId_userId: { organizationId: quem.organizationId, userId: alvoUserId } },
      }),
      // As sessões abertas dela caem junto: sem isto, quem foi removido
      // continuaria dentro do sistema até o token expirar.
      this.prisma.refreshToken.updateMany({
        where: { userId: alvoUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
      this.prisma.auditLog.create({
        data: {
          organizationId: quem.organizationId,
          userId: quem.userId,
          entity: "Membership",
          entityId: alvoUserId,
          action: "MEMBER_REMOVED",
          before: { role: alvo.role },
        },
      }),
    ]);
  }

  private exigeGestao(quem: AuthenticatedUser): void {
    if (quem.role !== "OWNER" && quem.role !== "ADMIN") {
      throw new AppException("FORBIDDEN", "Apenas donos e administradores gerenciam a equipe.", HttpStatus.FORBIDDEN);
    }
  }

  private async membroOuErro(organizationId: string, userId: string) {
    const membro = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
    });
    if (!membro) {
      throw new AppException("NOT_FOUND", "Esta pessoa não faz parte da organização.", HttpStatus.NOT_FOUND);
    }
    return membro;
  }

  /** Uma organização sem dono não teria como voltar a ter um. */
  private async exigeOutroDono(organizationId: string, exceto: string): Promise<void> {
    const outros = await this.prisma.membership.count({
      where: { organizationId, role: "OWNER", userId: { not: exceto } },
    });
    if (outros === 0) {
      throw new AppException(
        "LAST_OWNER",
        "Esta é a única pessoa com papel de dono. Promova outra antes.",
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
