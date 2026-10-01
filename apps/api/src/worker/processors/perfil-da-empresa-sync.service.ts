import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { LocalDoPerfil, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { hojeLocal } from "../../common/tempo";
import { AcessoAoGoogle } from "../../integrations/perfil-da-empresa/acesso-ao-google";
import { PerfilDaEmpresaClient } from "../../integrations/perfil-da-empresa/perfil-da-empresa-client";
import { ErroDoGoogle, explicaErroDoGoogle } from "../../integrations/perfil-da-empresa/erro-do-google";
import {
  DIAS_DA_RODADA,
  LinhaDoPerfil,
  linhasDaResposta,
  METRICAS_PEDIDAS,
} from "../../integrations/perfil-da-empresa/metricas-do-perfil";

/** Dias por pedido. O histórico vai em trechos, do mais novo para o mais antigo. */
const DIAS_POR_PEDIDO = 180;
/** Linhas por comando de escrita. */
const LOTE = 500;

const somaDias = (dia: string, dias: number) =>
  new Date(Date.parse(`${dia}T12:00:00.000Z`) + dias * 86_400_000).toISOString().slice(0, 10);

/** Os trechos de `de` a `ate`, do mais novo para o mais antigo. */
export function trechos(de: string, ate: string, tamanho = DIAS_POR_PEDIDO): { de: string; ate: string }[] {
  const lista: { de: string; ate: string }[] = [];
  let fim = ate;
  while (fim >= de) {
    const comeco = somaDias(fim, -(tamanho - 1));
    lista.push({ de: comeco < de ? de : comeco, ate: fim });
    fim = somaDias(comeco, -1);
  }
  return lista;
}

/**
 * Lê o Perfil da Empresa dos clientes e guarda um número por dia, em
 * `metricas_locais`, com a fonte PERFIL_DA_EMPRESA e o local no `escopo`.
 */
@Injectable()
export class PerfilDaEmpresaSyncService {
  private readonly logger = new Logger(PerfilDaEmpresaSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly acesso: AcessoAoGoogle,
    private readonly client: PerfilDaEmpresaClient,
  ) {}

  async sincroniza(organizationId: string, dias = DIAS_DA_RODADA): Promise<void> {
    const locais = await this.prisma.localDoPerfil.findMany({ where: { organizationId } });

    // O número de um local tirado deste cliente não fica para trás: ele pode
    // ter sido ligado a outro, e apareceria nos dois.
    await this.prisma.metricaLocal.deleteMany({
      where: { organizationId, fonte: "PERFIL_DA_EMPRESA", escopo: { notIn: locais.map((local) => local.localId) } },
    });
    if (!locais.length) return;

    let token: string;
    try {
      token = await this.acesso.token();
    } catch (erro) {
      if (!(erro instanceof ErroDoGoogle)) throw erro;
      await this.prisma.localDoPerfil.updateMany({ where: { organizationId }, data: { erro: explicaErroDoGoogle(erro) } });
      return;
    }

    for (const local of locais) await this.leLocal(organizationId, local, token, dias);
  }

  private async leLocal(organizationId: string, local: LocalDoPerfil, token: string, dias: number): Promise<void> {
    const ontem = somaDias(hojeLocal(), -1);
    let numerosAte = local.numerosAte?.toISOString().slice(0, 10) ?? null;

    try {
      for (const [indice, trecho] of trechos(somaDias(ontem, -(dias - 1)), ontem).entries()) {
        let resposta;
        try {
          resposta = await this.client.metricasDiarias(token, local.localId, METRICAS_PEDIDAS, trecho.de, trecho.ate);
        } catch (erro) {
          // Um trecho antigo recusado é o fim do que o Google guarda: o que
          // veio até aqui fica, e a leitura para de voltar no tempo.
          if (indice > 0 && erro instanceof ErroDoGoogle && erro.status === 400) break;
          throw erro;
        }

        const { linhas, ultimoComNumero } = linhasDaResposta(resposta);
        // No trecho mais novo, os dias depois do último número são os que o
        // Google ainda não contou: ficam de fora, em vez de virar zero.
        const validas = indice === 0 ? linhas.filter((linha) => ultimoComNumero !== null && linha.dia <= ultimoComNumero) : linhas;
        if (indice === 0 && ultimoComNumero && (!numerosAte || ultimoComNumero > numerosAte)) numerosAte = ultimoComNumero;
        await this.guarda(organizationId, local.localId, validas);
      }

      await this.prisma.localDoPerfil.updateMany({
        where: { id: local.id, organizationId },
        data: {
          sincronizadoEm: new Date(),
          erro: null,
          numerosAte: numerosAte ? new Date(`${numerosAte}T00:00:00.000Z`) : null,
        },
      });
    } catch (erro) {
      if (!(erro instanceof ErroDoGoogle)) throw erro;
      // Recusa do Google (permissão, cota, perfil removido) não melhora em
      // segundos: o motivo fica na tela da equipe, e a próxima rodada tenta.
      await this.prisma.localDoPerfil.updateMany({ where: { id: local.id }, data: { erro: explicaErroDoGoogle(erro) } });
      this.logger.warn(
        JSON.stringify({ event: "perfil_da_empresa_recusado", organizationId, local: local.localId, status: erro.status, erro: erro.message.slice(0, 300) }),
      );
    }
  }

  /** Grava em lote, substituindo o número do mesmo dia: a leitura mais nova é a que vale. */
  private async guarda(organizationId: string, localId: string, linhas: LinhaDoPerfil[]): Promise<void> {
    for (let inicio = 0; inicio < linhas.length; inicio += LOTE) {
      const lote = linhas.slice(inicio, inicio + LOTE);
      await this.prisma.$executeRaw`
        INSERT INTO "metricas_locais" ("id", "organization_id", "fonte", "metrica", "escopo", "dia", "valor", "atualizado_em")
        VALUES ${Prisma.join(
          lote.map(
            (linha) =>
              Prisma.sql`(${randomUUID()}, ${organizationId}, 'PERFIL_DA_EMPRESA'::"FonteDeMetricaLocal", ${linha.metrica}, ${localId}, ${linha.dia}::date, ${linha.valor}, now())`,
          ),
        )}
        ON CONFLICT ("organization_id", "fonte", "metrica", "escopo", "dia")
        DO UPDATE SET "valor" = EXCLUDED."valor", "atualizado_em" = now()
      `;
    }
  }
}
