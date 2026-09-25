import { HttpStatus, Injectable, Logger } from "@nestjs/common";
import { AuditAction, Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { AuthenticatedUser } from "../auth/jwt-payload.interface";
import { limpaSegredos } from "./limpa-segredos";
import { origemDaRequisicao } from "./contexto-da-requisicao";
import { CATEGORIAS, CategoriaDeAuditoria } from "./categorias";

/** Quem fez, do jeito que os serviços já conhecem a pessoa. */
export interface Autor {
  organizationId: string;
  /** Null quando a ação não tem uma pessoa por trás, como uma senha errada de e-mail desconhecido. */
  userId: string | null;
  /** Operador da plataforma visitando a conta. */
  impersonating?: boolean;
}

export interface Registro {
  acao: AuditAction;
  entidade: string;
  entidadeId: string;
  antes?: unknown;
  depois?: unknown;
}

/** Cliente do Prisma dentro ou fora de uma transação. */
type Cliente = Prisma.TransactionClient | PrismaService;

const POR_PAGINA = 50;

/** Quem pode ler a auditoria da conta. */
const PAPEIS_QUE_LEEM = new Set(["OWNER", "ADMIN"]);

export function autorDe(quem: AuthenticatedUser): Autor {
  return { organizationId: quem.organizationId, userId: quem.userId, impersonating: quem.impersonating };
}

@Injectable()
export class AuditoriaService {
  private readonly logger = new Logger(AuditoriaService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Uma ação sobre a própria conta de acesso (senha, e-mail, segundo fator),
   * gravada em cada organização de que a pessoa faz parte.
   *
   * A senha não pertence a uma organização, mas quem responde por cada uma
   * precisa saber que a senha de alguém da equipe mudou: é o primeiro sinal
   * de uma conta tomada.
   */
  async registraParaAPessoa(userId: string, registro: Registro): Promise<void> {
    const vinculos = await this.prisma.membership.findMany({
      where: { userId, organization: { deletedAt: null } },
      select: { organizationId: true },
    });
    for (const vinculo of vinculos) {
      await this.registra({ organizationId: vinculo.organizationId, userId }, registro);
    }
  }

  /**
   * Grava sem fazer quem chamou esperar. Só para tentativas que falharam,
   * como senha errada: esperar a gravação deixaria a resposta mais lenta
   * justamente quando o e-mail existe, e a diferença de tempo diria a quem
   * tenta adivinhar quais e-mails têm conta aqui.
   */
  registraSemEsperar(autor: Autor, registro: Registro): void {
    this.registra(autor, registro).catch((erro: Error) =>
      this.logger.error(JSON.stringify({ event: "auditoria_nao_gravada", acao: registro.acao, erro: erro.message })),
    );
  }

  /**
   * Grava uma ação.
   *
   * Aguardada, e não disparada em segundo plano: se a gravação falha, a ação
   * falha junto. Uma ação crítica sem rastro é pior que uma ação que não
   * aconteceu. Aceita a transação de quem chama, para a ação e o registro
   * dela serem uma coisa só.
   */
  async registra(autor: Autor, registro: Registro, cliente: Cliente = this.prisma): Promise<void> {
    const pessoa = autor.userId
      ? await cliente.user.findUnique({ where: { id: autor.userId }, select: { name: true, email: true } })
      : null;
    const origem = origemDaRequisicao();

    await cliente.auditLog.create({
      data: {
        organizationId: autor.organizationId,
        userId: pessoa ? autor.userId : null,
        autorNome: pessoa?.name ?? null,
        autorEmail: pessoa?.email ?? null,
        viaSuporte: Boolean(autor.impersonating),
        entity: registro.entidade,
        entityId: registro.entidadeId,
        action: registro.acao,
        before: comoJson(registro.antes),
        after: comoJson(registro.depois),
        ip: origem.ip,
        aparelho: origem.aparelho,
      },
    });
  }

  /**
   * A auditoria da conta, da mais recente para a mais antiga.
   *
   * Paginada por cursor, e não por número de página: o registro cresce o
   * tempo todo, e com página numerada um evento novo empurraria a lista e
   * faria a mesma linha aparecer em duas páginas seguidas. O cursor é o id da
   * última linha vista, e não a data dela: dois registros no mesmo
   * milissegundo, comuns numa troca de senha que também encerra sessões,
   * fariam um deles sumir entre as páginas.
   */
  async listar(
    quem: AuthenticatedUser,
    filtro: { categoria?: CategoriaDeAuditoria; pessoa?: string; depoisDe?: string },
  ) {
    await this.exigeQuemLe(quem);

    const acoes = filtro.categoria ? CATEGORIAS[filtro.categoria].acoes : undefined;

    const linhas = await this.prisma.auditLog.findMany({
      where: {
        organizationId: quem.organizationId,
        ...(acoes ? { action: { in: acoes } } : {}),
        ...(filtro.pessoa ? { userId: filtro.pessoa } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(filtro.depoisDe ? { cursor: { id: filtro.depoisDe }, skip: 1 } : {}),
      take: POR_PAGINA + 1,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        before: true,
        after: true,
        ip: true,
        aparelho: true,
        viaSuporte: true,
        autorNome: true,
        autorEmail: true,
        userId: true,
        createdAt: true,
      },
    });

    const temMais = linhas.length > POR_PAGINA;
    const pagina = temMais ? linhas.slice(0, POR_PAGINA) : linhas;
    return {
      itens: pagina,
      proxima: temMais ? pagina[pagina.length - 1].id : null,
    };
  }

  /** Quem aparece na auditoria, para o filtro por pessoa. */
  async pessoas(quem: AuthenticatedUser) {
    await this.exigeQuemLe(quem);
    const grupos = await this.prisma.auditLog.groupBy({
      by: ["userId", "autorNome", "autorEmail"],
      where: { organizationId: quem.organizationId, userId: { not: null } },
      orderBy: { autorNome: "asc" },
      take: 200,
    });
    return grupos.map((g) => ({ userId: g.userId, nome: g.autorNome, email: g.autorEmail }));
  }

  /**
   * Só dono e administrador. A auditoria mostra IP, aparelho e o que cada
   * pessoa da equipe fez; é informação de quem responde pela conta.
   * O operador da plataforma visitando a conta entra como dono.
   */
  private async exigeQuemLe(quem: AuthenticatedUser): Promise<void> {
    if (!PAPEIS_QUE_LEEM.has(quem.role)) {
      throw new AppException(
        "AUDITORIA_RESTRITA",
        "Só o dono e os administradores da conta veem a auditoria.",
        HttpStatus.FORBIDDEN,
      );
    }
  }
}

function comoJson(valor: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (valor === undefined || valor === null) return Prisma.JsonNull;
  return limpaSegredos(valor) as Prisma.InputJsonValue;
}
