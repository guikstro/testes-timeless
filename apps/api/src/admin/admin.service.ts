import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { PaginatedResult, PaginationQueryDto } from "../common/dto/pagination.dto";
import { AuthService } from "../auth/auth.service";
import { AuditoriaService } from "../auditoria/auditoria.service";
import { UpsertOperatorDto } from "./dto/upsert-operator.dto";
import { slugLivre } from "../common/utils/slug-livre";
import { ConviteGerado, ConvitesService } from "../auth/convites/convites.service";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { CriaConviteDto } from "./dto/cria-convite.dto";
import { MfaService } from "../auth/mfa/mfa.service";
import { WhatsAppConnectionsService } from "../integrations/whatsapp/whatsapp-connections.service";
import { LinkDeConexaoService, LinkGerado } from "../integrations/whatsapp/link-de-conexao.service";

/**
 * Prazo absoluto de uma visita a um cliente. Curto de propósito: o caso de
 * uso é dar suporte, não trabalhar dentro da conta alheia por horas. Passado
 * o prazo, é só entrar de novo pela administração — o que gera um novo
 * registro de acesso, deixando visível quanto tempo alguém realmente passou
 * lá dentro em vez de uma única entrada aberta indefinidamente.
 */
const IMPERSONATION_TTL_SECONDS = 30 * 60;

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
    private readonly auditoria: AuditoriaService,
    private readonly conexoes: WhatsAppConnectionsService,
    private readonly links: LinkDeConexaoService,
    private readonly convites: ConvitesService,
    private readonly mfa: MfaService,
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
    await this.auditoria.registra({ organizationId, userId: adminUserId, impersonating: true }, {
      acao: "IMPERSONATION_STARTED",
      entidade: "Organization",
      entidadeId: organizationId,
      depois: { organizationName: organization.name },
    });

    this.logger.warn(
      JSON.stringify({ event: "impersonation_started", adminUserId, organizationId }),
    );

    // OWNER porque o operador precisa poder consertar o que o cliente pediu;
    // o que o mantém seguro é o registro em auditoria, o aviso permanente na
    // tela e o prazo abaixo — não um papel reduzido.
    const expiresAt = Math.floor(Date.now() / 1000) + IMPERSONATION_TTL_SECONDS;
    const tokens = await this.auth.issueTokenPair(adminUserId, organizationId, "OWNER", { expiresAt });

    return {
      ...tokens,
      organization: { id: organization.id, name: organization.name },
      expiresAt,
    };
  }

  /** Operadores da plataforma e seus níveis (rota exclusiva de ADMIN). */
  async listOperators() {
    return this.prisma.user.findMany({
      where: { platformRole: { not: null }, deletedAt: null },
      orderBy: [{ platformRole: "desc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, platformRole: true },
    });
  }

  /**
   * Promove um usuário existente a operador, ou muda o nível de quem já é.
   *
   * Não cria conta nem define senha de propósito: a pessoa precisa já ter um
   * cadastro. Criar usuários por aqui misturaria "gerenciar acesso interno"
   * com "cadastrar gente", e abriria um caminho de criação de conta que não
   * passa pelo fluxo normal.
   */
  async upsertOperator(actingUserId: string, dto: UpsertOperatorDto) {
    const target = await this.prisma.user.findUnique({
      where: { email: dto.email.trim().toLowerCase() },
      select: { id: true, platformRole: true, deletedAt: true },
    });

    if (!target || target.deletedAt) {
      throw new AppException(
        "USER_NOT_FOUND",
        "Nenhum usuário com este e-mail. A pessoa precisa criar a conta antes de virar operador.",
        HttpStatus.NOT_FOUND,
      );
    }

    // Rebaixar a si mesmo é a mesma armadilha de se auto-revogar: quem faz
    // isso perde o acesso na mesma hora e pode deixar a plataforma sem ADMIN.
    if (target.id === actingUserId && dto.role !== "ADMIN") {
      throw new AppException(
        "CANNOT_DEMOTE_SELF",
        "Você não pode rebaixar o seu próprio acesso. Peça a outro administrador.",
        HttpStatus.BAD_REQUEST,
      );
    }

    if (target.platformRole === "ADMIN" && dto.role !== "ADMIN") {
      await this.assertNotLastAdmin(target.id);
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: { platformRole: dto.role },
      select: { id: true, name: true, email: true, platformRole: true },
    });

    this.logger.warn(
      JSON.stringify({
        event: "platform_operator_changed",
        actingUserId,
        targetUserId: updated.id,
        role: dto.role,
      }),
    );

    return updated;
  }

  /** Revoga o acesso de operador. O usuário continua existindo como cliente. */
  async revokeOperator(actingUserId: string, targetUserId: string): Promise<void> {
    if (targetUserId === actingUserId) {
      throw new AppException(
        "CANNOT_REVOKE_SELF",
        "Você não pode revogar o seu próprio acesso. Peça a outro administrador.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, platformRole: true },
    });

    if (!target?.platformRole) {
      throw new AppException("NOT_FOUND", "Este usuário não é um operador.", HttpStatus.NOT_FOUND);
    }

    if (target.platformRole === "ADMIN") {
      await this.assertNotLastAdmin(target.id);
    }

    await this.prisma.user.update({ where: { id: targetUserId }, data: { platformRole: null } });

    this.logger.warn(
      JSON.stringify({ event: "platform_operator_revoked", actingUserId, targetUserId }),
    );
  }

  /**
   * Ficar sem nenhum ADMIN trancaria todo mundo para fora da gestão de
   * operadores — só um acesso direto ao banco resolveria. Barrar aqui é mais
   * barato que esse resgate.
   */
  private async assertNotLastAdmin(targetUserId: string): Promise<void> {
    const otherAdmins = await this.prisma.user.count({
      where: { platformRole: "ADMIN", deletedAt: null, id: { not: targetUserId } },
    });

    if (otherAdmins === 0) {
      throw new AppException(
        "LAST_ADMIN",
        "Este é o último administrador da plataforma. Promova outro antes de remover este.",
        HttpStatus.BAD_REQUEST,
      );
    }
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

  /** A cor identifica o cliente nas telas da equipe, então não se repete entre clientes ativos. */
  async criaCliente(operadorId: string, nome: string, cor: string): Promise<{ id: string; name: string }> {
    // ponytail: conferência fora da transação, dois cadastros simultâneos com a
    // mesma cor passam. Índice único parcial no banco se isso virar problema.
    const jaUsada = await this.prisma.organization.findFirst({
      where: { deletedAt: null, brandColor: { equals: cor, mode: "insensitive" } },
      select: { name: true },
    });
    if (jaUsada) {
      throw new AppException("COR_EM_USO", `Essa cor já é do cliente ${jaUsada.name}. Escolha outra.`, HttpStatus.CONFLICT);
    }

    const cliente = await this.prisma.$transaction(async (tx) =>
      tx.organization.create({
        data: { name: nome, brandColor: cor, slug: await slugLivre(tx, nome) },
        select: { id: true, name: true },
      }),
    );
    await this.auditoria.registra(
      { organizationId: cliente.id, userId: operadorId, impersonating: true },
      { acao: "ORGANIZATION_CREATED", entidade: "Organization", entidadeId: cliente.id, antes: null, depois: { nome, cor, criadaPor: "equipe da plataforma" } },
    );
    return cliente;
  }

  async criaConvite(operador: AuthenticatedUser, dto: CriaConviteDto): Promise<ConviteGerado> {
    const paraCliente = dto.acesso === "cliente";
    // Quem entra pela equipe nasce ADMIN da plataforma; o SUPPORT não pode criar alguém acima dele.
    if (!paraCliente && operador.platformRole !== "ADMIN") {
      throw new AppException(
        "INSUFFICIENT_PLATFORM_ROLE",
        "Só um administrador da plataforma convida alguém para a equipe Timeless.",
        HttpStatus.FORBIDDEN,
      );
    }
    const organizationId = paraCliente ? (await this.exigeCliente(dto.organizationId!)).id : operador.organizationId;
    const convite = await this.convites.cria({
      organizationId,
      email: dto.email,
      papel: paraCliente ? "MEMBER" : "ADMIN",
      areas: paraCliente ? dto.areas! : [],
      operador: !paraCliente,
    });
    await this.auditoria.registra(
      { organizationId, userId: operador.userId, impersonating: paraCliente },
      {
        acao: "INVITE_CREATED",
        entidade: "Convite",
        entidadeId: organizationId,
        depois: { convidado: dto.email, acesso: paraCliente ? "cliente" : "equipe Timeless", areas: dto.areas ?? "todas" },
      },
    );
    return convite;
  }

  /**
   * Exclui o cliente: some das listas e ninguém mais entra nele. Os dados
   * ficam no banco (`deletedAt`), então um engano ainda tem volta pelo suporte.
   * A frase vem antes do código para um erro de digitação não gastar o código.
   */
  async excluiCliente(operador: AuthenticatedUser, organizationId: string, confirmacao: string, codigo: string): Promise<void> {
    const cliente = await this.exigeCliente(organizationId);
    if (organizationId === operador.organizationId) {
      throw new AppException("EXCLUSAO_PROIBIDA", "Não dá para excluir a conta da própria equipe.", HttpStatus.FORBIDDEN);
    }

    const esperada = `Quero excluir o ${cliente.name}`;
    if (confirmacao.trim().replace(/\s+/g, " ") !== esperada) {
      throw new AppException("CONFIRMACAO_INCORRETA", `Digite exatamente: ${esperada}`, HttpStatus.BAD_REQUEST);
    }
    if (!(await this.mfa.confereSegundoFator(operador.userId, codigo.replace(/\s/g, "")))) {
      throw new AppException("CODIGO_INVALIDO", "Código de verificação inválido.", HttpStatus.BAD_REQUEST);
    }

    // O WhatsApp primeiro: senão o número continuaria recebendo mensagens de um cliente que não existe mais.
    if (await this.conexoes.getCurrent(organizationId)) await this.conexoes.disconnect(organizationId);
    await this.links.encerra(organizationId);

    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.organization.update({ where: { id: organizationId }, data: { deletedAt: agora } }),
      this.prisma.sessao.updateMany({
        where: { organizationId, encerradaEm: null },
        data: { encerradaEm: agora, motivoDoEncerramento: "cliente excluído pela equipe Timeless" },
      }),
    ]);
    await this.auditoria.registra(
      { organizationId, userId: operador.userId, impersonating: true },
      { acao: "ORGANIZATION_DELETED", entidade: "Organization", entidadeId: organizationId, antes: { nome: cliente.name }, depois: { excluidoEm: agora } },
    );
  }
  /** Quem tem acesso a um cliente, para a página dele no painel da Timeless. */
  async pessoasDoCliente(organizationId: string) {
    await this.exigeCliente(organizationId);
    const vinculos = await this.prisma.membership.findMany({
      where: { organizationId, user: { deletedAt: null } },
      orderBy: { createdAt: "asc" },
      select: { role: true, areas: true, user: { select: { id: true, name: true, email: true } } },
    });
    return vinculos.map((v) => ({ userId: v.user.id, nome: v.user.name, email: v.user.email, papel: v.role, areas: v.areas }));
  }

  /** Tira a pessoa do cliente e encerra as sessões dela lá na hora. */
  async removePessoa(operadorId: string, organizationId: string, userId: string): Promise<void> {
    await this.exigeCliente(organizationId);
    const vinculo = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { role: true, user: { select: { email: true } } },
    });
    if (!vinculo) throw new AppException("NOT_FOUND", "Esta pessoa não tem acesso a este cliente.", HttpStatus.NOT_FOUND);

    const agora = new Date();
    await this.prisma.$transaction([
      this.prisma.membership.delete({ where: { organizationId_userId: { organizationId, userId } } }),
      this.prisma.sessao.updateMany({
        where: { userId, organizationId, encerradaEm: null },
        data: { encerradaEm: agora, motivoDoEncerramento: "acesso removido pela equipe Timeless" },
      }),
    ]);
    await this.auditoria.registra(
      { organizationId, userId: operadorId, impersonating: true },
      { acao: "MEMBER_REMOVED", entidade: "Membership", entidadeId: userId, antes: { email: vinculo.user.email, papel: vinculo.role } },
    );
  }

  /** O WhatsApp de um cliente, como a página dele no painel mostra. */
  async whatsappDoCliente(organizationId: string) {
    const organizacao = await this.exigeCliente(organizationId);
    const [conexao, linkExpiraEm] = await Promise.all([
      this.conexoes.getCurrent(organizationId),
      this.links.expiracao(organizationId),
    ]);
    return {
      organizacao,
      conexao: conexao && {
        status: conexao.status,
        provider: conexao.provider,
        numero: conexao.displayPhoneNumber,
        ultimoEventoEm: conexao.lastEventAt,
      },
      linkExpiraEm,
    };
  }

  async geraLinkDoWhatsApp(operadorId: string, organizationId: string): Promise<LinkGerado> {
    await this.exigeCliente(organizationId);
    const link = await this.links.gera(organizationId);
    await this.auditoria.registra(
      { organizationId, userId: operadorId, impersonating: true },
      { acao: "INTEGRATION_UPDATED", entidade: "LinkDeConexaoWhatsApp", entidadeId: organizationId, depois: { integracao: "WhatsApp", linkExpiraEm: link.expiraEm } },
    );
    return link;
  }

  async desconectaWhatsApp(operadorId: string, organizationId: string): Promise<void> {
    await this.exigeCliente(organizationId);
    const antes = await this.conexoes.getCurrent(organizationId);
    await this.links.encerra(organizationId);
    if (!antes) return;

    await this.conexoes.disconnect(organizationId);
    await this.auditoria.registra(
      { organizationId, userId: operadorId, impersonating: true },
      { acao: "INTEGRATION_DISCONNECTED", entidade: "WhatsAppConnection", entidadeId: antes.id, antes: { integracao: "WhatsApp", numero: antes.displayPhoneNumber } },
    );
  }

  private async exigeCliente(organizationId: string): Promise<{ id: string; name: string; brandColor: string | null }> {
    const organizacao = await this.prisma.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
      select: { id: true, name: true, brandColor: true },
    });
    if (!organizacao) throw new AppException("ORGANIZATION_NOT_FOUND", "Cliente não encontrado.", HttpStatus.NOT_FOUND);
    return organizacao;
  }
}
