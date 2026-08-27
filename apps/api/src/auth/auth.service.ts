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
      include: { memberships: true },
    });

    const passwordMatches = await bcrypt.compare(dto.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !passwordMatches) {
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

    // Preserva a marca de impersonação — ver a nota em issueTokenPair.
    return this.issueTokenPair(
      payload.sub,
      payload.organizationId,
      payload.role,
      payload.impersonating === true,
    );
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
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
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

  /** Contexto da sessão para o shell da aplicação — ver `AuthController.session`. */
  async getSession(user: AuthenticatedUser) {
    const [record, organization] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: user.userId },
        select: { id: true, name: true, email: true, isPlatformAdmin: true },
      }),
      this.prisma.organization.findFirst({
        where: { id: user.organizationId, deletedAt: null },
        select: { id: true, name: true },
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
   * `impersonating` é propagado por todo caminho que emite tokens, inclusive
   * o refresh: se ele se perdesse na renovação, um operador da plataforma
   * acabaria com uma sessão comum dentro do cliente — sem o aviso na tela e
   * sem rastro de que aquilo era uma impersonação.
   *
   * Público (não privado) porque o módulo de administração precisa emitir o
   * par de tokens da organização em que o operador está entrando.
   */
  async issueTokenPair(
    userId: string,
    organizationId: string,
    role: JwtPayload["role"],
    impersonating = false,
  ): Promise<TokenPair> {
    const claims = {
      sub: userId,
      organizationId,
      role,
      ...(impersonating ? { impersonating: true as const } : {}),
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
