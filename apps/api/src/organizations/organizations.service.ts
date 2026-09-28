import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { MembershipRole } from "@prisma/client";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { UpdateOrganizationDto } from "./dto/update-organization.dto";
import { ArmazenamentoService } from "./upload/armazenamento.service";
import { ErroDaImagem, validaImagem } from "./upload/imagem-enviada";
import { Autor, AuditoriaService, autorDe } from "../auditoria/auditoria.service";
import { enderecoPublico } from "../common/configuracao/ambiente";
import { exige } from "../common/permissoes/capacidades";
import { AuthService, TokenPair } from "../auth/auth.service";
import { MfaService } from "../auth/mfa/mfa.service";

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly armazenamento: ArmazenamentoService,
    private readonly auditoria: AuditoriaService,
    private readonly auth: AuthService,
    private readonly mfa: MfaService,
  ) {}

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

  async updateCurrent(autor: Autor, dto: UpdateOrganizationDto) {
    const organizationId = autor.organizationId;
    const atual = await this.getCurrent(organizationId);

    // Uma janela invertida faria toda espera contar como zero, sem erro
    // visível: o número simplesmente ficaria bom demais para ser verdade.
    if (
      dto.expedienteInicio !== undefined &&
      dto.expedienteFim !== undefined &&
      dto.expedienteFim <= dto.expedienteInicio
    ) {
      throw new AppException(
        "EXPEDIENTE_INVALIDO",
        "O horário de fechamento precisa ser depois do de abertura.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const atualizada = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...dto,
        // String vazia é "remover", não "gravar vazio": é assim que o campo
        // volta ao padrão depois de ter sido preenchido.
        ...(dto.logoUrl === "" ? { logoUrl: null } : {}),
        ...(dto.brandColor === "" ? { brandColor: null } : {}),
        ...(dto.googleConversionQualified === "" ? { googleConversionQualified: null } : {}),
        ...(dto.googleConversionWon === "" ? { googleConversionWon: null } : {}),
      },
    });

    // Só os campos que o pedido tocou, e o valor de cada um antes e depois:
    // o registro inteiro da organização esconderia a mudança no meio de
    // vinte campos iguais.
    // Só os que vieram de fato: a validação cria o objeto com todos os campos
    // declarados, e os ausentes chegam como `undefined`.
    const campos = (Object.keys(dto) as (keyof UpdateOrganizationDto)[]).filter((c) => dto[c] !== undefined);
    const antes = Object.fromEntries(campos.map((c) => [c, atual[c as keyof typeof atual] ?? null]));
    const depois = Object.fromEntries(campos.map((c) => [c, atualizada[c as keyof typeof atualizada] ?? null]));
    if (JSON.stringify(antes) !== JSON.stringify(depois)) {
      await this.auditoria.registra(autor, {
        acao: "ORGANIZATION_UPDATED",
        entidade: "Organization",
        entidadeId: organizationId,
        antes,
        depois,
      });
    }

    return atualizada;
  }


  /** Mensagem por motivo, para a tela dizer o que houve em vez de "falhou". */
  private static readonly MOTIVO: Record<ErroDaImagem, string> = {
    FORMATO_INVALIDO: "Arquivo inválido. Envie uma imagem PNG, JPEG ou WebP.",
    TIPO_NAO_ACEITO: "Formato não aceito. Use PNG, JPEG ou WebP; SVG não é permitido por segurança.",
    GRANDE_DEMAIS: "A imagem passa de 2 MB. Reduza o tamanho e tente de novo.",
    CONTEUDO_NAO_CONFERE: "O conteúdo do arquivo não corresponde a uma imagem válida.",
  };

  /**
   * Recebe a logo da organização.
   *
   * O arquivo anterior é apagado depois de o novo estar gravado e o banco
   * apontar para ele. Na ordem inversa, uma falha no meio deixaria a
   * organização apontando para um arquivo que não existe mais, e a logo
   * sumiria de todas as telas.
   */
  async enviarLogo(autor: Autor, arquivo: string) {
    const organizationId = autor.organizationId;
    const atual = await this.getCurrent(organizationId);

    const resultado = validaImagem(arquivo);
    if (!resultado.ok) {
      throw new AppException("IMAGEM_INVALIDA", OrganizationsService.MOTIVO[resultado.erro], HttpStatus.BAD_REQUEST);
    }

    const nome = await this.armazenamento.guardar(resultado.imagem);
    // O endereço fica gravado no banco: um localhost aqui continua errado
    // depois de a variável ser corrigida. A conferência de ambiente barra
    // isso na subida, em produção.
    const base = enderecoPublico();

    const atualizada = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { logoUrl: `${base}/uploads/${nome}` },
    });

    await this.armazenamento.apagarPelaUrl(atual.logoUrl);
    await this.auditoria.registra(autor, {
      acao: "ORGANIZATION_UPDATED",
      entidade: "Organization",
      entidadeId: organizationId,
      antes: { logoUrl: atual.logoUrl },
      depois: { logoUrl: atualizada.logoUrl },
    });
    return atualizada;
  }

  /** Remove a logo e o arquivo, voltando à inicial do nome. */
  async removerLogo(autor: Autor) {
    const organizationId = autor.organizationId;
    const atual = await this.getCurrent(organizationId);
    const atualizada = await this.prisma.organization.update({
      where: { id: organizationId },
      data: { logoUrl: null },
    });
    await this.armazenamento.apagarPelaUrl(atual.logoUrl);
    await this.auditoria.registra(autor, {
      acao: "ORGANIZATION_UPDATED",
      entidade: "Organization",
      entidadeId: organizationId,
      antes: { logoUrl: atual.logoUrl },
      depois: { logoUrl: null },
    });
    return atualizada;
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
    const acessos = await this.prisma.auditLog.findMany({
      where: { organizationId, action: "IMPERSONATION_STARTED" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        // Nome e e-mail de quem entrou; nunca o id interno do operador.
        user: { select: { name: true, email: true } },
        autorNome: true,
        autorEmail: true,
      },
    });
    // O nome copiado no registro vale quando o operador já não existe: a
    // visita aconteceu, e quem a fez continua sendo informação do cliente.
    return acessos.map(({ autorNome, autorEmail, user, ...acesso }) => ({
      ...acesso,
      user: user ?? (autorNome && autorEmail ? { name: autorNome, email: autorEmail } : null),
    }));
  }

  /** Quem está na organização. Todo mundo de dentro pode ver com quem divide a conta. */
  async listMembers(organizationId: string) {
    const membros = await this.prisma.membership.findMany({
      where: { organizationId, user: { deletedAt: null } },
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      select: {
        role: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, platformRole: true } },
      },
    });

    return membros.map((membro) => ({
      userId: membro.user.id,
      name: membro.user.name,
      email: membro.user.email,
      role: membro.role,
      joinedAt: membro.createdAt,
      // Da equipe Timeless: é para quem a posse da conta da equipe pode ir.
      daEquipe: Boolean(membro.user.platformRole),
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
    exige(quem, "member.manage");
    const alvo = await this.membroOuErro(quem.organizationId, alvoUserId);

    if (alvoUserId === quem.userId) {
      throw new AppException(
        "CANNOT_CHANGE_OWN_ROLE",
        "Você não pode mudar o seu próprio papel.",
        HttpStatus.BAD_REQUEST,
      );
    }
    if (alvo.role === "OWNER" || role === "OWNER") exige(quem, "owner.manage");
    if (role === "OWNER" && alvo.role !== "OWNER" && (await this.ehOperador(quem))) {
      throw new AppException(
        "USE_A_TRANSFERENCIA",
        "Na conta da equipe, a posse passa pela transferência, que pede o código do autenticador.",
        HttpStatus.BAD_REQUEST,
      );
    }
    if (alvo.role === "OWNER" && role !== "OWNER") {
      await this.exigeOutroDono(quem.organizationId, alvoUserId);
    }

    await this.prisma.membership.update({
      where: { organizationId_userId: { organizationId: quem.organizationId, userId: alvoUserId } },
      data: { role },
    });

    const pessoa = await this.prisma.user.findUnique({
      where: { id: alvoUserId },
      select: { name: true, email: true },
    });
    await this.auditoria.registra(autorDe(quem), {
      acao: "MEMBER_ROLE_CHANGED",
      entidade: "Membership",
      entidadeId: alvoUserId,
      antes: { role: alvo.role, nome: pessoa?.name ?? null, email: pessoa?.email ?? null },
      depois: { role },
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
    exige(quem, "member.manage");
    const alvo = await this.membroOuErro(quem.organizationId, alvoUserId);

    if (alvoUserId === quem.userId) {
      throw new AppException(
        "CANNOT_REMOVE_SELF",
        "Você não pode remover a si mesmo. Peça a outro dono.",
        HttpStatus.BAD_REQUEST,
      );
    }
    if (alvo.role === "OWNER") exige(quem, "owner.manage");
    if (alvo.role === "OWNER") {
      await this.exigeOutroDono(quem.organizationId, alvoUserId);
    }

    // O nome de quem saiu vai para o registro: depois da remoção, o id sozinho
    // não diz nada a quem lê a auditoria.
    const pessoa = await this.prisma.user.findUnique({
      where: { id: alvoUserId },
      select: { name: true, email: true },
    });

    // Transação interativa, e não a lista de antes, para o registro de
    // auditoria entrar junto: se ele falhar, a remoção não acontece.
    await this.prisma.$transaction(async (tx) => {
      await tx.membership.delete({
        where: { organizationId_userId: { organizationId: quem.organizationId, userId: alvoUserId } },
      });
      // As sessões abertas dela caem junto: sem isto, quem foi removido
      // continuaria dentro do sistema até o token expirar.
      /*
        Só as sessões desta organização, e não todas as da pessoa.

        Ela pode pertencer a outras, e ser removida daqui não é motivo para
        perder o acesso de lá. A revogação antiga não tinha como distinguir,
        porque a renovação não sabe de organização nenhuma; a sessão sabe.

        As renovações sem sessão, de antes desta mudança, continuam caindo
        todas: sem saber a organização delas, derrubar é o lado seguro.
      */
      await tx.refreshToken.updateMany({
        where: {
          userId: alvoUserId,
          revokedAt: null,
          OR: [{ sessaoId: null }, { sessao: { organizationId: quem.organizationId } }],
        },
        data: { revokedAt: new Date() },
      });
      // E a sessão, não só a renovação: sem isto o token de acesso de quem foi
      // removido seguia valendo por até quinze minutos, que é o que o
      // comentário acima prometia que não aconteceria.
      await tx.sessao.updateMany({
        where: { userId: alvoUserId, organizationId: quem.organizationId, encerradaEm: null },
        data: { encerradaEm: new Date(), motivoDoEncerramento: "removido da organização" },
      });
      await this.auditoria.registra(
        autorDe(quem),
        {
          acao: "MEMBER_REMOVED",
          entidade: "Membership",
          entidadeId: alvoUserId,
          antes: { role: alvo.role, nome: pessoa?.name ?? null, email: pessoa?.email ?? null },
        },
        tx,
      );
    });
  }

  /**
   * Passa a posse da conta da equipe para outra pessoa da equipe.
   *
   * Só existe na conta da equipe Timeless, e só para quem já é da equipe:
   * quem é dono dela enxerga todos os clientes, e isso nunca pode ir para um
   * cliente. Pede o código do autenticador porque é a ação mais poderosa da
   * conta, e uma sessão esquecida aberta não pode bastar para ela.
   *
   * Quem transfere vira administrador. Devolve a sessão dele já renovada, com
   * o papel novo, para a tela não continuar achando que ele é dono.
   */
  async transferePosse(quem: AuthenticatedUser, alvoUserId: string, codigo: string): Promise<TokenPair> {
    exige(quem, "owner.manage");
    if (quem.impersonating) {
      throw new AppException("TRANSFERENCIA_PROIBIDA", "Numa visita de suporte não se transfere a posse da conta.", HttpStatus.FORBIDDEN);
    }
    if (!(await this.ehOperador(quem))) {
      throw new AppException(
        "TRANSFERENCIA_PROIBIDA",
        "A transferência de posse existe só na conta da equipe Timeless.",
        HttpStatus.FORBIDDEN,
      );
    }
    if (alvoUserId === quem.userId) {
      throw new AppException("TRANSFERENCIA_PROIBIDA", "Escolha outra pessoa da equipe.", HttpStatus.BAD_REQUEST);
    }

    const alvo = await this.membroOuErro(quem.organizationId, alvoUserId);
    const pessoas = await this.prisma.user.findMany({
      where: { id: { in: [quem.userId, alvoUserId] } },
      select: { id: true, name: true, email: true, platformRole: true, deletedAt: true },
    });
    const eu = pessoas.find((p) => p.id === quem.userId);
    const novoDono = pessoas.find((p) => p.id === alvoUserId);
    if (!novoDono || novoDono.deletedAt || !novoDono.platformRole) {
      throw new AppException(
        "SO_PARA_A_EQUIPE",
        "Só alguém da equipe Timeless pode ser dono desta conta.",
        HttpStatus.FORBIDDEN,
      );
    }

    // O código por último: um erro de escolha não gasta o código.
    if (!(await this.mfa.confereSegundoFator(quem.userId, codigo.replace(/\s/g, "")))) {
      const temFator = await this.prisma.userMfa.findFirst({ where: { userId: quem.userId, confirmadoEm: { not: null } } });
      throw temFator
        ? new AppException("CODIGO_INVALIDO", "Código de verificação inválido.", HttpStatus.BAD_REQUEST)
        : new AppException(
            "MFA_OBRIGATORIO",
            "Ative a verificação em duas etapas em Segurança antes de transferir a posse.",
            HttpStatus.FORBIDDEN,
          );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.membership.update({
        where: { organizationId_userId: { organizationId: quem.organizationId, userId: alvoUserId } },
        data: { role: "OWNER", areas: [] },
      });
      await tx.membership.update({
        where: { organizationId_userId: { organizationId: quem.organizationId, userId: quem.userId } },
        data: { role: "ADMIN" },
      });
      await this.auditoria.registra(
        autorDe(quem),
        {
          acao: "OWNERSHIP_TRANSFERRED",
          entidade: "Membership",
          entidadeId: alvoUserId,
          antes: { dono: eu?.name ?? null, email: eu?.email ?? null, papelDoNovoDono: alvo.role },
          depois: { dono: novoDono.name, email: novoDono.email },
        },
        tx,
      );
    });

    return this.auth.issueTokenPair(
      quem.userId,
      quem.organizationId,
      "ADMIN",
      undefined,
      quem.sessaoId ? { id: quem.sessaoId } : undefined,
    );
  }

  /** Operador da plataforma na própria conta: é o que diz que esta é a conta da equipe. */
  private async ehOperador(quem: AuthenticatedUser): Promise<boolean> {
    if (quem.impersonating) return false;
    const eu = await this.prisma.user.findUnique({ where: { id: quem.userId }, select: { platformRole: true } });
    return Boolean(eu?.platformRole);
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
