import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { EncryptionService } from "../../common/encryption/encryption.service";
import { hojeLocal } from "../../common/tempo";
import { MetaGraphClient } from "../../integrations/meta/meta-graph-client";
import { MetaApiError } from "../../integrations/meta/meta-api-error";
import {
  DIAS_DO_HISTORICO,
  ErroDaPagina,
  explicaErroDaPagina,
  LinhaDaPagina,
  linhasDosInsights,
  METRICAS_DIARIAS,
  PERIODOS_DOS_VISUALIZADORES,
  VISUALIZADORES,
} from "../../integrations/meta/insights-da-pagina";

/** Linhas por comando de escrita: bem abaixo do limite de parâmetros do Postgres. */
const LOTE = 500;

const somaDias = (dia: string, dias: number) =>
  new Date(Date.parse(`${dia}T12:00:00.000Z`) + dias * 86_400_000).toISOString().slice(0, 10);

/**
 * Lê os Insights da Página do Facebook e guarda um número por dia.
 *
 * Roda separado da sincronia dos anúncios porque é outro limite de uso na
 * Meta: uma leitura da Página não gasta nada do teto da conta de anúncios, e
 * um bloqueio de um não precisa parar o outro.
 */
@Injectable()
export class PaginaSyncService {
  private readonly logger = new Logger(PaginaSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly metaGraphClient: MetaGraphClient,
  ) {}

  /**
   * @param dias Quantos dias para trás. A rodada de hora em hora relê os
   * últimos três, porque a Meta continua acertando os números de ontem; ao
   * escolher a Página, o histórico inteiro que cabe numa chamada.
   */
  async sincroniza(organizationId: string, dias = 3): Promise<void> {
    const conexao = await this.prisma.metaConnection.findUnique({
      where: { organizationId },
      select: { paginaId: true, status: true, accessTokenEncrypted: true },
    });
    if (!conexao?.paginaId || conexao.status === "DISCONNECTED") return;
    const paginaId = conexao.paginaId;

    try {
      const token = this.encryption.decrypt(conexao.accessTokenEncrypted);
      const pagina = await this.metaGraphClient.getPagina(paginaId, token);
      if (!pagina.access_token) {
        throw new ErroDaPagina(
          "A Meta não devolveu o acesso à Página. Adicione a Página aos ativos do usuário do sistema, com permissão de ver o desempenho, e gere um token novo com pages_show_list, pages_read_engagement e read_insights.",
        );
      }

      const hoje = hojeLocal();
      const ate = somaDias(hoje, 1);
      const diarias = await this.leDiarias(paginaId, pagina.access_token, somaDias(hoje, -Math.min(dias, DIAS_DO_HISTORICO)), ate);

      // Os visualizadores únicos só servem do dia mais recente: é o total
      // dos últimos 7 e 28 dias até ali. Três dias cobrem o atraso da Meta.
      const visualizadores: LinhaDaPagina[] = [];
      for (const periodo of PERIODOS_DOS_VISUALIZADORES) {
        const resposta = await this.metaGraphClient.getInsightsDaPagina(
          paginaId,
          pagina.access_token,
          [VISUALIZADORES],
          periodo,
          somaDias(hoje, -2),
          ate,
        );
        visualizadores.push(...linhasDosInsights(resposta, periodo));
      }

      await this.guarda(organizationId, paginaId, [...diarias, ...visualizadores]);

      await this.prisma.metaConnection.update({
        where: { organizationId },
        data: { paginaNome: pagina.name ?? null, paginaSincronizadaEm: new Date(), paginaErro: null },
      });
    } catch (erro) {
      // A Página de outro id pode ter sido escolhida enquanto esta rodava.
      const atual = await this.prisma.metaConnection.findUnique({ where: { organizationId }, select: { paginaId: true } });
      if (atual?.paginaId === paginaId) {
        await this.prisma.metaConnection.update({
          where: { organizationId },
          data: { paginaErro: explicaErroDaPagina(erro as Error) },
        });
      }
      this.logger.warn(
        JSON.stringify({ event: "pagina_sync_falhou", organizationId, erro: (erro as Error).message?.slice(0, 300) }),
      );
      // Erro da Meta (permissão, Página errada, limite) não melhora tentando
      // de novo em segundos: o motivo fica na tela e a próxima hora tenta.
      // Erro de rede volta ao BullMQ, que tenta de novo.
      if (erro instanceof MetaApiError || erro instanceof ErroDaPagina) return;
      throw erro;
    }
  }

  /**
   * As métricas diárias numa chamada só. Se a Meta recusar algum nome (ela
   * aposenta métricas sem aviso), pede uma a uma e guarda as que vierem: uma
   * métrica aposentada não pode apagar as outras sete da tela.
   */
  private async leDiarias(paginaId: string, tokenDaPagina: string, desde: string, ate: string): Promise<LinhaDaPagina[]> {
    try {
      const resposta = await this.metaGraphClient.getInsightsDaPagina(
        paginaId,
        tokenDaPagina,
        [...METRICAS_DIARIAS],
        "day",
        desde,
        ate,
      );
      return linhasDosInsights(resposta);
    } catch (erro) {
      if (!(erro instanceof MetaApiError) || erro.code !== 100) throw erro;
    }

    const linhas: LinhaDaPagina[] = [];
    for (const metrica of METRICAS_DIARIAS) {
      try {
        const resposta = await this.metaGraphClient.getInsightsDaPagina(paginaId, tokenDaPagina, [metrica], "day", desde, ate);
        linhas.push(...linhasDosInsights(resposta));
      } catch (erro) {
        if (!(erro instanceof MetaApiError) || erro.code !== 100) throw erro;
        this.logger.warn(JSON.stringify({ event: "metrica_da_pagina_recusada", metrica, erro: erro.message.slice(0, 200) }));
      }
    }
    return linhas;
  }

  /**
   * Grava em lote, substituindo o número do mesmo dia: a Meta acerta os
   * números dos últimos dias, e a leitura mais nova é a que vale.
   */
  private async guarda(organizationId: string, paginaId: string, linhas: LinhaDaPagina[]): Promise<void> {
    for (let inicio = 0; inicio < linhas.length; inicio += LOTE) {
      const lote = linhas.slice(inicio, inicio + LOTE);
      await this.prisma.$executeRaw`
        INSERT INTO "metricas_da_pagina" ("id", "organization_id", "pagina_id", "metrica", "dia", "valor", "atualizado_em")
        VALUES ${Prisma.join(
          lote.map(
            (linha) =>
              Prisma.sql`(${randomUUID()}, ${organizationId}, ${paginaId}, ${linha.metrica}, ${linha.dia}::date, ${linha.valor}, now())`,
          ),
        )}
        ON CONFLICT ("organization_id", "pagina_id", "metrica", "dia")
        DO UPDATE SET "valor" = EXCLUDED."valor", "atualizado_em" = now()
      `;
    }
  }
}
