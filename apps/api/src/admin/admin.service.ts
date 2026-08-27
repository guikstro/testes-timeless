import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { PaginatedResult, PaginationQueryDto } from "../common/dto/pagination.dto";
import { AuthService } from "../auth/auth.service";

/**
 * Painel do operador da plataforma (Fase 9). Este é o único serviço do
 * sistema que atravessa organizações de propósito — todo o resto é
 * estritamente escopado por `organizationId`. Por isso ele fica isolado num
 * módulo próprio, atrás do `PlatformAdminGuard`, em vez de virar um "modo
 * especial" espalhado pelos serviços existentes.
 */
@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** Lista os clientes com os números que dizem se a conta está viva ou parada. */
  async listOrganizations(
    pagination: PaginationQueryDto,
    search?: string,
  ): Promise<PaginatedResult<unknown>> {
    const offset = pagination.offset ?? 0;
    const limit = pagination.limit ?? 20;

    const where: Prisma.OrganizationWhereInput = {
      deletedAt: null,
      ...(search?.trim()
        ? {
            OR: [
              { name: { contains: search.trim(), mode: "insensitive" } },
              { slug: { contains: search.trim(), mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [organizations, total] = await Promise.all([
      this.prisma.organization.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          whatsappConnection: { select: { provider: true, status: true, lastEventAt: true } },
          metaConnection: { select: { status: true, lastSyncedAt: true } },
          _count: { select: { leads: true, memberships: true } },
          memberships: {
            where: { role: "OWNER" },
            take: 1,
            select: { user: { select: { name: true, email: true } } },
          },
        },
      }),
      this.prisma.organization.count({ where }),
    ]);

    // Receita e contagem de vendas por organização numa consulta agregada só,
    // em vez de uma por linha (Seção 75 — evitar N+1).
    const organizationIds = organizations.map((organization) => organization.id);
    const salesByOrganization = await this.prisma.sale.groupBy({
      by: ["organizationId"],
      where: { organizationId: { in: organizationIds }, deletedAt: null },
      _count: { _all: true },
      _sum: { amountCents: true },
    });
    const salesIndex = new Map(salesByOrganization.map((row) => [row.organizationId, row]));

    const items = organizations.map((organization) => {
      const sales = salesIndex.get(organization.id);
      const { memberships, _count, ...rest } = organization;

      return {
        ...rest,
        owner: memberships[0]?.user ?? null,
        leadCount: _count.leads,
        memberCount: _count.memberships,
        saleCount: sales?._count._all ?? 0,
        revenueCents: sales?._sum.amountCents ?? 0,
      };
    });

    return { items, total, offset, limit };
  }

  /**
   * Emite um par de tokens do operador dentro da organização alvo.
   *
   * O `sub` do token continua sendo o operador — nunca um usuário do cliente.
   * É isso que faz qualquer alteração feita aqui dentro (uma correção de
   * venda, por exemplo) ficar registrada no `AuditLog` com o nome de quem
   * realmente agiu, em vez de aparecer como se o próprio cliente tivesse
   * feito.
   */
  async impersonate(adminUserId: string, organizationId: string) {
    const organization = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!organization) {
      throw new AppException("NOT_FOUND", "Organização não encontrada.", HttpStatus.NOT_FOUND);
    }

    // Registrado ANTES de emitir o token: se a gravação da auditoria falhar,
    // o acesso não acontece. Um acesso sem rastro é pior que um acesso
    // negado.
    await this.prisma.auditLog.create({
      data: {
        organizationId,
        userId: adminUserId,
        entity: "Organization",
        entityId: organizationId,
        action: "IMPERSONATION_STARTED",
        after: { organizationName: organization.name },
      },
    });

    this.logger.warn(
      JSON.stringify({ event: "impersonation_started", adminUserId, organizationId }),
    );

    // OWNER porque o operador precisa poder consertar o que o cliente pediu;
    // o que o mantém seguro é o registro em auditoria e o aviso permanente
    // na tela, não um papel reduzido.
    const tokens = await this.auth.issueTokenPair(adminUserId, organizationId, "OWNER", true);

    return { ...tokens, organization: { id: organization.id, name: organization.name } };
  }

  /** Histórico de entradas em clientes, para o operador auditar a si mesmo. */
  async listImpersonations(pagination: PaginationQueryDto): Promise<PaginatedResult<unknown>> {
    const offset = pagination.offset ?? 0;
    const limit = pagination.limit ?? 20;
    const where = { action: "IMPERSONATION_STARTED" as const };

    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: {
          user: { select: { name: true, email: true } },
          organization: { select: { name: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items, total, offset, limit };
  }
}
