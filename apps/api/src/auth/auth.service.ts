import { HttpStatus, Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcrypt";
import * as crypto from "crypto";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { slugify } from "../common/utils/slugify";
import { hashToken } from "../common/utils/hash-token";
import { isUniqueConstraintError } from "../common/utils/is-unique-constraint-error";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { ChangeEmailDto } from "./dto/change-email.dto";
import { AuthenticatedUser, JwtPayload } from "./jwt-payload.interface";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1 hour
const BCRYPT_ROUNDS = 12;

// Compared against on every login with an unknown e-mail so the bcrypt cost
// is paid regardless — otherwise response time leaks whether an account
// exists (real accounts take ~bcrypt-compare-time longer to reject).
const DUMMY_PASSWORD_HASH = bcrypt.hashSync("not-a-real-password", BCRYPT_ROUNDS);

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<TokenPair> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new AppException("EMAIL_ALREADY_IN_USE", "Este e-mail já está em uso.", HttpStatus.CONFLICT);
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const baseSlug = slugify(dto.organizationName) || "org";

    // The findUnique-then-create checks above and below are not atomic, so
    // two identical requests can race past both checks; the unique
    // constraints are the real source of truth and P2002 here is expected,
    // not exceptional — without this catch it surfaced as a raw 500.
    let result: { user: { id: string }; membership: { organizationId: string; role: JwtPayload["role"] } };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        let slug = baseSlug;
        let suffix = 0;

        for (;;) {
          const collision = await tx.organization.findUnique({ where: { slug } });
          if (!collision) break;
          suffix += 1;
          slug = `${baseSlug}-${suffix}`;
        }

        const organization = await tx.organization.create({
          data: { name: dto.organizationName, slug },
        });

        const user = await tx.user.create({
          data: { name: dto.name, email: dto.email, passwordHash },
        });

        const membership = await tx.membership.create({
          data: { organizationId: organization.id, userId: user.id, role: "OWNER" },
        });

        return { user, membership };
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new AppException("EMAIL_ALREADY_IN_USE", "Este e-mail já está em uso.", HttpStatus.CONFLICT);
      }
      throw error;
    }

    return this.issueTokenPair(result.user.id, result.membership.organizationId, result.membership.role);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      // Vínculo com organização apagada não conta. Sem este filtro, entrar
      // funcionava e a sessão morria logo depois em `getSession`, que confere
      // isto: o resultado era um login que dava certo e uma tela que dizia
      // "sessão inválida", sem nada explicando por quê.
      include: { memberships: { where: { organization: { deletedAt: null } } } },
    });

    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    // Conta desativada responde igual a e-mail que não existe, e depois de
    // pagar o mesmo custo de bcrypt: separar as duas respostas transformaria
    // o login num verificador de quem já teve conta aqui.
    if (!user || user.deletedAt || !passwordMatches) {
      throw new AppException("INVALID_CREDENTIALS", "E-mail ou senha inválidos.", HttpStatus.UNAUTHORIZED);
    }

    if (user.memberships.length === 0) {
      throw new AppException(
        "NO_ORGANIZATION",
        "Este usuário não pertence a nenhuma organização.",
        HttpStatus.FORBIDDEN,
      );
    }

    const membership = dto.organizationId
      ? user.memberships.find((m) => m.organizationId === dto.organizationId)
      : user.memberships[0];

    if (!membership) {
      throw new AppException(
        "ORGANIZATION_NOT_FOUND",
        "Organização não encontrada para este usuário.",
        HttpStatus.FORBIDDEN,
      );
    }

    return this.issueTokenPair(user.id, membership.organizationId, membership.role);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const tokenHash = hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new AppException("INVALID_REFRESH_TOKEN", "Sessão expirada. Faça login novamente.", HttpStatus.UNAUTHORIZED);
    }

    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken);
    } catch {
      throw new AppException("INVALID_REFRESH_TOKEN", "Sessão expirada. Faça login novamente.", HttpStatus.UNAUTHORIZED);
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });

    // Preserva a impersonação, mas **nunca** estende o prazo dela: renovar
    // carrega adiante o mesmo `impersonationExpiresAt` original. É o que
    // impede uma visita a um cliente de virar acesso indefinido.
    const impersonation = payload.impersonating
      ? { expiresAt: payload.impersonationExpiresAt ?? 0 }
      : undefined;

    if (impersonation && impersonation.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new AppException(
        "IMPERSONATION_EXPIRED",
        "A sessão dentro do cliente expirou. Entre novamente pela administração.",
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (impersonation) {
      /*
        Visita de suporte: o operador não tem vínculo com a organização do
        cliente, então não há papel a reler. O que precisa ser reconferido é
        se ele ainda é operador da plataforma: revogar o acesso de alguém não
        pode esperar a visita dele terminar.
      */
      const operador = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { platformRole: true, deletedAt: true },
      });

      if (!operador?.platformRole || operador.deletedAt) {
        throw new AppException("INVALID_REFRESH_TOKEN", "Sessão expirada. Faça login novamente.", HttpStatus.UNAUTHORIZED);
      }

      return this.issueTokenPair(payload.sub, payload.organizationId, payload.role, impersonation);
    }

    /*
      O papel vem do banco, nunca do token antigo.

      Renovar remontava o token a partir do papel que estava no token
      anterior, e isso tinha uma consequência que anulava a tela de equipe:
      rebaixar alguém de dono para membro não surtia efeito nenhum enquanto a
      pessoa mantivesse a sessão viva. Ela renovava sozinha a cada quinze
      minutos, sempre com o papel antigo, por até sete dias. Remover já
      revogava as sessões; rebaixar não, e o rebaixamento é justamente a ação
      pensada para quando não se quer expulsar ninguém.

      O vínculo também é reconferido aqui, e não só o papel: uma sessão de
      quem não está mais na organização não deve produzir token novo.
    */
    const vinculo = await this.prisma.membership.findUnique({
      where: { organizationId_userId: { organizationId: payload.organizationId, userId: payload.sub } },
      select: { role: true, user: { select: { deletedAt: true } } },
    });

    if (!vinculo || vinculo.user.deletedAt) {
      throw new AppException("INVALID_REFRESH_TOKEN", "Sessão expirada. Faça login novamente.", HttpStatus.UNAUTHORIZED);
    }

    return this.issueTokenPair(payload.sub, payload.organizationId, vinculo.role);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashToken(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Always returns success regardless of whether the e-mail exists, to avoid
   * leaking account existence. The token itself is only surfaced via the
   * configured EmailProvider (see integrations/email) — see docs/ARCHITECTURE.md.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string; devToken?: string }> {
    // `deletedAt` no filtro: uma conta desativada não recupera a si mesma de
    // volta para dentro do sistema.
    const user = await this.prisma.user.findFirst({ where: { email: dto.email, deletedAt: null } });
    if (!user) {
      return { message: "Se o e-mail existir, enviaremos instruções de recuperação." };
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(rawToken),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    // In production this should be delivered via a real EmailProvider (SMTP/SES/Resend).
    // No provider is configured yet — see docs/ARCHITECTURE.md "Pendências".
    const isDev = process.env.NODE_ENV !== "production";
    return {
      message: "Se o e-mail existir, enviaremos instruções de recuperação.",
      ...(isDev ? { devToken: rawToken } : {}),
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = hashToken(dto.token);
    const stored = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });

    if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
      throw new AppException("INVALID_RESET_TOKEN", "Token de recuperação inválido ou expirado.", HttpStatus.BAD_REQUEST);
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
      this.prisma.passwordResetToken.update({
        where: { id: stored.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: stored.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }


  /**
   * Troca a senha de quem está logado.
   *
   * A senha atual é exigida mesmo havendo sessão aberta: sem isso, uma aba
   * esquecida num computador compartilhado vira troca de senha, e quem
   * passou por ali fica dono da conta.
   *
   * Todas as outras sessões caem, que é o ponto de trocar a senha quando se
   * desconfia de alguém. Um par novo de tokens é devolvido para quem trocou
   * continuar onde está, em vez de ser expulso pela própria ação.
   */
  async changePassword(quem: AuthenticatedUser, dto: ChangePasswordDto): Promise<TokenPair> {
    this.recusaSeForVisita(quem);
    const user = await this.prisma.user.findUnique({ where: { id: quem.userId } });
    if (!user || user.deletedAt) {
      throw new AppException("NOT_FOUND", "Usuário não encontrado.", HttpStatus.NOT_FOUND);
    }

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new AppException("INVALID_PASSWORD", "Senha atual incorreta.", HttpStatus.BAD_REQUEST);
    }

    if (await bcrypt.compare(dto.newPassword, user.passwordHash)) {
      throw new AppException("SAME_PASSWORD", "A nova senha precisa ser diferente da atual.", HttpStatus.BAD_REQUEST);
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: quem.userId }, data: { passwordHash } }),
      this.prisma.refreshToken.updateMany({
        where: { userId: quem.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return this.issueTokenPair(user.id, quem.organizationId, quem.role);
  }

  /**
   * Troca o e-mail de acesso.
   *
   * Não existe confirmação no endereço novo porque o produto ainda não envia
   * e-mail (ver `forgotPassword` e docs/ARCHITECTURE.md). Isso tem uma
   * consequência que a tela precisa dizer com todas as letras: um endereço
   * digitado errado passa a ser o login, e a recuperação de senha iria para
   * ele. A senha atual é exigida por isso, e as outras sessões caem junto.
   */
  async changeEmail(quem: AuthenticatedUser, dto: ChangeEmailDto): Promise<TokenPair> {
    this.recusaSeForVisita(quem);
    const user = await this.prisma.user.findUnique({ where: { id: quem.userId } });
    if (!user || user.deletedAt) {
      throw new AppException("NOT_FOUND", "Usuário não encontrado.", HttpStatus.NOT_FOUND);
    }

    if (!(await bcrypt.compare(dto.currentPassword, user.passwordHash))) {
      throw new AppException("INVALID_PASSWORD", "Senha atual incorreta.", HttpStatus.BAD_REQUEST);
    }

    const novoEmail = dto.newEmail.trim().toLowerCase();
    if (novoEmail === user.email) {
      throw new AppException("SAME_EMAIL", "Este já é o seu e-mail.", HttpStatus.BAD_REQUEST);
    }

    try {
      await this.prisma.$transaction([
        this.prisma.user.update({ where: { id: quem.userId }, data: { email: novoEmail } }),
        this.prisma.refreshToken.updateMany({
          where: { userId: quem.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        }),
      ]);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Mensagem genérica de propósito: dizer "já existe conta com este
        // e-mail" transforma esta rota num verificador de quem tem conta.
        throw new AppException("EMAIL_UNAVAILABLE", "Não foi possível usar este e-mail.", HttpStatus.CONFLICT);
      }
      throw error;
    }

    return this.issueTokenPair(user.id, quem.organizationId, quem.role);
  }


  /**
   * Nem senha nem e-mail mudam de dentro de uma visita de suporte.
   *
   * Numa impersonação o token continua sendo do operador da plataforma, então
   * a senha atual que ele conhece é a dele. Sem esta trava, entrar para dar
   * suporte permitiria trocar a credencial do cliente e assumir a conta.
   */
  private recusaSeForVisita(quem: AuthenticatedUser): void {
    if (quem.impersonating) {
      throw new AppException(
        "IMPERSONATION_FORBIDDEN",
        "Não é possível alterar credenciais durante um acesso de suporte.",
        HttpStatus.FORBIDDEN,
      );
    }
  }

  /** Contexto da sessão para o shell da aplicação — ver `AuthController.session`. */
  async getSession(user: AuthenticatedUser) {
    const [record, organization] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { id: true, name: true, email: true, platformRole: true },
      }),
      this.prisma.organization.findFirst({
        where: { id: user.organizationId, deletedAt: null },
        select: { id: true, name: true, logoUrl: true, brandColor: true },
      }),
    ]);

    if (!record || !organization) {
      throw new AppException("UNAUTHORIZED", "Sessão inválida.", HttpStatus.UNAUTHORIZED);
    }

    return {
      user: record,
      organization,
      role: user.role,
      impersonating: user.impersonating,
    };
  }

  /**
   * A impersonação é propagada por todo caminho que emite tokens, inclusive
   * o refresh: se ela se perdesse na renovação, um operador da plataforma
   * acabaria com uma sessão comum dentro do cliente — sem o aviso na tela e
   * sem rastro de que aquilo era uma impersonação.
   *
   * O prazo vem junto num objeto só (em vez de um booleano solto + uma data
   * opcional) porque impersonar **sem** prazo não é um estado válido: seria
   * exatamente o acesso permanente que o prazo existe para evitar.
   *
   * Público (não privado) porque o módulo de administração precisa emitir o
   * par de tokens da organização em que o operador está entrando.
   */
  async issueTokenPair(
    userId: string,
    organizationId: string,
    role: JwtPayload["role"],
    impersonation?: { expiresAt: number },
  ): Promise<TokenPair> {
    const claims = {
      sub: userId,
      organizationId,
      role,
      ...(impersonation
        ? { impersonating: true as const, impersonationExpiresAt: impersonation.expiresAt }
        : {}),
    };

    const accessToken = await this.jwt.signAsync(
      { ...claims, jti: crypto.randomUUID() },
      { expiresIn: ACCESS_TOKEN_TTL },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...claims, jti: crypto.randomUUID() },
      { expiresIn: Math.floor(REFRESH_TOKEN_TTL_MS / 1000) },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return { accessToken, refreshToken };
  }
}
