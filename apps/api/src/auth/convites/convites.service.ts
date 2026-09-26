import { HttpStatus, Injectable, OnModuleDestroy } from "@nestjs/common";
import { MembershipRole } from "@prisma/client";
import type Redis from "ioredis";
import * as bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AppException } from "../../common/exceptions/app-exception";
import { criaConexaoRedis } from "../../common/queue/redis-connection";
import { hashToken } from "../../common/utils/hash-token";
import { isUniqueConstraintError } from "../../common/utils/is-unique-constraint-error";
import { enderecoDaAplicacao } from "../../common/configuracao/ambiente";
import { AuthService } from "../auth.service";
import { ContextoDoCliente } from "../sessoes/contexto-do-cliente";

/** Três dias: tempo de a pessoa ver a mensagem e abrir, sem o link valer para sempre. */
const VALIDADE_EM_SEGUNDOS = 72 * 60 * 60;
const BCRYPT_ROUNDS = 12;

export interface DadosDoConvite {
  organizationId: string;
  email: string;
  papel: MembershipRole;
  areas: string[];
  /** Convite para a equipe Timeless: a conta nasce operadora da plataforma. */
  operador: boolean;
}

export interface ConviteGerado {
  url: string;
  expiraEm: string;
}

const invalido = () =>
  new AppException("CONVITE_INVALIDO", "Este convite é inválido, já foi usado ou venceu. Peça um novo.", HttpStatus.NOT_FOUND);

const emailEmUso = () => new AppException("EMAIL_ALREADY_IN_USE", "Este e-mail já tem conta.", HttpStatus.CONFLICT);

/**
 * O convite é o único jeito de criar conta depois da primeira: a pessoa abre
 * o link e escolhe a própria senha. No Redis fica só o hash do token, e o
 * aceite lê e apaga numa operação só (`GETDEL`), então o link vale uma vez.
 */
@Injectable()
export class ConvitesService implements OnModuleDestroy {
  private readonly redis: Redis = criaConexaoRedis(ConvitesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  async cria(dados: DadosDoConvite): Promise<ConviteGerado> {
    await this.exigeEmailLivre(dados.email);
    const token = randomBytes(32).toString("base64url");
    await this.redis.set(this.chave(token), JSON.stringify(dados), "EX", VALIDADE_EM_SEGUNDOS);
    return {
      url: `${enderecoDaAplicacao()}/convite/${token}`,
      expiraEm: new Date(Date.now() + VALIDADE_EM_SEGUNDOS * 1000).toISOString(),
    };
  }

  /** O que a página do convite mostra antes de a pessoa criar a senha. */
  async le(token: string): Promise<{ organizacao: string; email: string }> {
    const dados = await this.dados(token, false);
    const organizacao = await this.prisma.organization.findFirst({
      where: { id: dados.organizationId, deletedAt: null },
      select: { name: true },
    });
    if (!organizacao) throw invalido();
    return { organizacao: organizacao.name, email: dados.email };
  }

  async aceita(token: string, nome: string, senha: string, contexto?: ContextoDoCliente) {
    const dados = await this.dados(token, true);
    await this.exigeEmailLivre(dados.email);

    const passwordHash = await bcrypt.hash(senha, BCRYPT_ROUNDS);
    let userId: string;
    try {
      userId = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { name: nome, email: dados.email, passwordHash, platformRole: dados.operador ? "ADMIN" : null },
        });
        await tx.membership.create({
          data: { organizationId: dados.organizationId, userId: user.id, role: dados.papel, areas: dados.areas },
        });
        return user.id;
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) throw emailEmUso();
      throw error;
    }

    return this.auth.issueTokenPair(userId, dados.organizationId, dados.papel, undefined, { contexto });
  }

  private async dados(token: string, gasta: boolean): Promise<DadosDoConvite> {
    if (!token || token.length > 128) throw invalido();
    const bruto = gasta ? await this.redis.getdel(this.chave(token)) : await this.redis.get(this.chave(token));
    if (!bruto) throw invalido();
    return JSON.parse(bruto) as DadosDoConvite;
  }

  private async exigeEmailLivre(email: string): Promise<void> {
    const existe = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existe) throw emailEmUso();
  }

  private chave(token: string): string {
    return `convite:${hashToken(token)}`;
  }
}
