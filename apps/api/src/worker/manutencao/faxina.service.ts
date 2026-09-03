import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";

/**
 * Quanto tempo um aviso já entregue continua no histórico.
 *
 * Noventa dias porque o sino é memória de curto prazo: ninguém rola a caixa
 * até o ano passado, e o que aconteceu de fato vive na linha do tempo do
 * lead, que não é apagada aqui.
 */
const RETENCAO_DE_AVISOS_PADRAO = 90;

/**
 * Folga antes de apagar um token já vencido.
 *
 * Um dia, para relógio dessincronizado entre contêineres nunca apagar algo
 * que ainda estava valendo. Um token vencido já é recusado de qualquer jeito,
 * então a folga não custa nada.
 */
const FOLGA_DE_TOKEN_EM_DIAS = 1;

/** Quantas linhas por rodada. Um `DELETE` de milhões de linhas trava a tabela. */
const TAMANHO_DO_LOTE = 5_000;

/** Teto de lotes por execução, para a faxina nunca virar uma tarefa infinita. */
const LOTES_POR_EXECUCAO = 200;

const DIA_EM_MS = 24 * 60 * 60 * 1000;

export interface ResultadoDaFaxina {
  tokensDeSessao: number;
  tokensDeRecuperacao: number;
  tokensDeTrocaDeEmail: number;
  avisos: number;
}

/**
 * Apaga o que já não serve para ninguém.
 *
 * Três tabelas cresciam para sempre. `refresh_tokens` ganha uma linha a cada
 * renovação e nunca perdia nenhuma: com token de acesso de quinze minutos e
 * renovação silenciosa, são umas trinta e cinco mil linhas por pessoa por
 * ano. `password_reset_tokens` e `email_change_tokens` idem.
 * `notifications` grava uma linha por membro por evento.
 *
 * O que NÃO é apagado aqui, e de propósito: mensagem, evento de lead, clique
 * e registro de auditoria. Esses são a medição do produto e o histórico de
 * quem fez o quê. Apagá-los seria reescrever o que aconteceu, e a decisão de
 * quanto guardar disso é do cliente, não de uma rotina de limpeza.
 */
@Injectable()
export class FaxinaService {
  private readonly logger = new Logger(FaxinaService.name);

  constructor(private readonly prisma: PrismaService) {}

  async executar(): Promise<ResultadoDaFaxina> {
    const agora = Date.now();
    const limiteDeToken = new Date(agora - FOLGA_DE_TOKEN_EM_DIAS * DIA_EM_MS);
    const limiteDeAviso = new Date(agora - this.retencaoDeAvisosEmDias() * DIA_EM_MS);

    const resultado: ResultadoDaFaxina = {
      // Um token vencido é recusado antes de qualquer consulta ao banco, então
      // guardá-lo não protege nada: só ocupa índice.
      tokensDeSessao: await this.apagarEmLotes("refresh_tokens", "expires_at", limiteDeToken),
      tokensDeRecuperacao: await this.apagarEmLotes("password_reset_tokens", "expires_at", limiteDeToken),
      tokensDeTrocaDeEmail: await this.apagarEmLotes("email_change_tokens", "expires_at", limiteDeToken),
      avisos: await this.apagarEmLotes("notifications", "created_at", limiteDeAviso),
    };

    this.logger.log(JSON.stringify({ event: "faxina_concluida", ...resultado }));
    return resultado;
  }

  /**
   * Apaga em lotes, e não de uma vez.
   *
   * Um `DELETE` sobre a tabela inteira segura trava até terminar, e a primeira
   * execução numa base que nunca foi limpa é justamente a maior de todas. Em
   * lotes, cada transação é curta e o resto do sistema continua escrevendo.
   */
  private async apagarEmLotes(tabela: string, coluna: string, limite: Date): Promise<number> {
    // Tabela e coluna vêm de constantes deste arquivo, nunca de entrada
    // externa: `Prisma.raw` só é seguro sob essa condição.
    const alvo = Prisma.raw(`"${tabela}"`);
    const campo = Prisma.raw(`"${coluna}"`);
    let total = 0;

    for (let lote = 0; lote < LOTES_POR_EXECUCAO; lote++) {
      const apagadas = await this.prisma.$executeRaw`
        DELETE FROM ${alvo}
        WHERE id IN (
          SELECT id FROM ${alvo} WHERE ${campo} < ${limite} LIMIT ${TAMANHO_DO_LOTE}
        )
      `;

      total += apagadas;
      if (apagadas < TAMANHO_DO_LOTE) return total;
    }

    // Chegou ao teto: sobrou coisa para a próxima rodada. Vale um aviso, senão
    // uma tabela que cresce mais rápido do que a limpeza some da vista.
    this.logger.warn(JSON.stringify({ event: "faxina_incompleta", tabela, apagadas: total }));
    return total;
  }

  private retencaoDeAvisosEmDias(): number {
    const bruto = Number(process.env.NOTIFICATION_RETENTION_DAYS);
    if (!Number.isFinite(bruto) || bruto <= 0) return RETENCAO_DE_AVISOS_PADRAO;
    // Piso de sete dias: um valor pequeno demais apagaria o aviso antes de a
    // pessoa voltar de uma semana de férias.
    return Math.max(7, Math.floor(bruto));
  }
}
