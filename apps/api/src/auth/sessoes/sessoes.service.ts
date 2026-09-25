import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AppException } from "../../common/exceptions/app-exception";
import { AuthenticatedUser } from "../jwt-payload.interface";
import { AuditoriaService } from "../../auditoria/auditoria.service";
import { descreveAparelho, rotuloDoAparelho } from "./descreve-aparelho";

export interface SessaoNaTela {
  id: string;
  aparelho: string;
  movel: boolean;
  ip: string | null;
  criadaEm: string;
  ultimaAtividadeEm: string;
  /** É esta aba. A tela precisa saber para não oferecer "encerrar" nela. */
  atual: boolean;
  /** Visita de suporte: um operador da plataforma agindo dentro desta organização. */
  visita: boolean;
}

/**
 * As sessões de quem está olhando, e só as dele.
 *
 * Toda consulta daqui filtra por `userId` da sessão autenticada, nunca por um
 * id vindo da requisição. Encerrar a sessão de outra pessoa não é uma
 * permissão que exista nesta tela, e o jeito de garantir que não existe é não
 * haver caminho por onde passar o id de outra pessoa.
 */
@Injectable()
export class SessoesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  async listar(quem: AuthenticatedUser): Promise<SessaoNaTela[]> {
    const sessoes = await this.prisma.sessao.findMany({
      where: {
        userId: quem.userId,
        encerradaEm: null,
        /*
          Só as que ainda podem renovar.

          Uma sessão abandonada num notebook há dez dias não foi encerrada, mas
          a renovação dela já venceu e ela não volta mais. Listá-la faria a
          pessoa encerrar algo que já morreu sozinho, e esconderia as que
          importam no meio das que não importam.
        */
        refreshTokens: { some: { revokedAt: null, expiresAt: { gt: new Date() } } },
      },
      orderBy: { ultimaAtividadeEm: "desc" },
      take: 50,
      select: {
        id: true,
        userAgent: true,
        ip: true,
        criadaEm: true,
        ultimaAtividadeEm: true,
        impersonando: true,
      },
    });

    return sessoes.map((sessao) => {
      const aparelho = descreveAparelho(sessao.userAgent);
      return {
        id: sessao.id,
        aparelho: rotuloDoAparelho(aparelho),
        movel: aparelho.movel,
        ip: sessao.ip,
        criadaEm: sessao.criadaEm.toISOString(),
        ultimaAtividadeEm: sessao.ultimaAtividadeEm.toISOString(),
        atual: sessao.id === quem.sessaoId,
        visita: sessao.impersonando,
      };
    });
  }

  /**
   * Encerra uma sessão da própria pessoa.
   *
   * Id de sessão de outra pessoa responde igual a id inexistente, porque a
   * consulta simplesmente não o encontra: o filtro por `userId` está dentro
   * dela, não numa conferência depois.
   */
  async encerrar(quem: AuthenticatedUser, sessaoId: string): Promise<void> {
    if (sessaoId === quem.sessaoId) {
      // Encerrar a própria aba por aqui deixaria a tela sem sessão no meio da
      // ação. O caminho para isso é "sair", que também limpa os cookies.
      throw new AppException(
        "SESSAO_ATUAL",
        "Esta é a sessão que você está usando agora. Para encerrá-la, use Sair.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const [encerradas] = await this.prisma.$transaction([
      this.prisma.sessao.updateMany({
        where: { id: sessaoId, userId: quem.userId, encerradaEm: null },
        data: { encerradaEm: new Date(), motivoDoEncerramento: "encerrada pela própria pessoa" },
      }),
      this.prisma.refreshToken.updateMany({
        where: { sessaoId, userId: quem.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    if (encerradas.count === 0) {
      throw new AppException("NAO_ENCONTRADA", "Sessão não encontrada.", HttpStatus.NOT_FOUND);
    }

    await this.auditoria.registraParaAPessoa(quem.userId, {
      acao: "SESSIONS_ENDED",
      entidade: "Sessao",
      entidadeId: sessaoId,
      depois: { encerradas: 1 },
    });
  }

  /**
   * Encerra todas as outras, e mantém esta.
   *
   * É o botão de quem desconfia de alguma coisa. Manter a sessão atual é o
   * que permite apertá-lo sem precisar entrar de novo logo em seguida, que é
   * quando a pessoa mais precisa estar dentro para trocar a senha.
   */
  async encerrarOutras(quem: AuthenticatedUser): Promise<{ encerradas: number }> {
    const exceto = quem.sessaoId ? { id: { not: quem.sessaoId } } : {};

    const [encerradas] = await this.prisma.$transaction([
      this.prisma.sessao.updateMany({
        where: { userId: quem.userId, encerradaEm: null, ...exceto },
        data: { encerradaEm: new Date(), motivoDoEncerramento: "encerradas as outras sessões" },
      }),
      this.prisma.refreshToken.updateMany({
        where: {
          userId: quem.userId,
          revokedAt: null,
          // Renovações sem sessão, de antes desta mudança, também caem: sem
          // saber a qual aparelho pertencem, deixá-las viver seria o contrário
          // do que o botão promete.
          ...(quem.sessaoId ? { OR: [{ sessaoId: null }, { sessaoId: { not: quem.sessaoId } }] } : {}),
        },
        data: { revokedAt: new Date() },
      }),
    ]);

    if (encerradas.count > 0) {
      await this.auditoria.registraParaAPessoa(quem.userId, {
        acao: "SESSIONS_ENDED",
        entidade: "User",
        entidadeId: quem.userId,
        depois: { encerradas: encerradas.count, todasAsOutras: true },
      });
    }

    return { encerradas: encerradas.count };
  }
}
