import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
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
}
