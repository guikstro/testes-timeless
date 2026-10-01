import { HttpStatus, Injectable } from "@nestjs/common";
import { randomBytes, randomUUID } from "node:crypto";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AppException } from "../../../common/exceptions/app-exception";
import { hashToken } from "../../../common/utils/hash-token";
import { enderecoPublico } from "../../../common/configuracao/ambiente";
import { AuditoriaService, Autor } from "../../../auditoria/auditoria.service";
import { contaLegivel, converteCampanha, converteMetricasLocais, metricasMedidas } from "./converte-envio";
import { Prisma } from "@prisma/client";
import { scriptDoGoogleAds, VERSAO_DAS_ACOES_LOCAIS, VERSAO_DO_SCRIPT } from "./script-do-google-ads";
import { EnvioDoScriptDto } from "./envio.dto";

/** Sem envio há mais que isto, a tela avisa que o script parou. */
const ENVIO_ATRASADO_EM_HORAS = 3;

/** O teto de dias de um envio: o mesmo que cabe por campanha no corpo. */
const DIAS_POR_ENVIO = 62;

/** Linhas de gasto por comando de escrita. */
const LOTE = 500;

const diaUtc = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

@Injectable()
export class GoogleAdsScriptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /**
   * Gera a chave do cliente e o script com ela dentro.
   *
   * A chave aparece uma vez só, dentro do script: aqui fica apenas o hash.
   * Gerar de novo troca a chave, e o script antigo passa a ser recusado, que
   * é o jeito de cortar um script colado no lugar errado.
   */
  async geraScript(autor: Autor) {
    const chave = `tml_gads_${randomBytes(32).toString("base64url")}`;
    const anterior = await this.prisma.googleAdsConexao.findUnique({ where: { organizationId: autor.organizationId } });

    await this.prisma.googleAdsConexao.upsert({
      where: { organizationId: autor.organizationId },
      create: { organizationId: autor.organizationId, chaveHash: hashToken(chave) },
      // A conta ligada continua a mesma: trocar a chave não é trocar de conta.
      update: { chaveHash: hashToken(chave) },
    });

    await this.auditoria.registra(autor, {
      acao: anterior ? "INTEGRATION_UPDATED" : "INTEGRATION_CONNECTED",
      entidade: "GoogleAdsConexao",
      entidadeId: autor.organizationId,
      depois: { integracao: "Google Ads", forma: "script", chave: "nova" },
    });

    const endereco = `${enderecoPublico()}/api/publico/google-ads/envio`;
    return { script: scriptDoGoogleAds(endereco, chave) };
  }

  async desconecta(autor: Autor): Promise<void> {
    const conexao = await this.prisma.googleAdsConexao.findUnique({ where: { organizationId: autor.organizationId } });
    if (!conexao) {
      throw new AppException("NOT_CONNECTED", "Nenhum script do Google Ads ligado a este cliente.", HttpStatus.NOT_FOUND);
    }
    // Só a chave sai. Campanhas e gasto que já chegaram ficam: são histórico.
    await this.prisma.googleAdsConexao.delete({ where: { organizationId: autor.organizationId } });
    await this.auditoria.registra(autor, {
      acao: "INTEGRATION_DISCONNECTED",
      entidade: "GoogleAdsConexao",
      entidadeId: autor.organizationId,
      antes: { integracao: "Google Ads", conta: conexao.customerId ? contaLegivel(conexao.customerId) : null },
    });
  }

  /** A conexão e as campanhas do Google no período, com os números de cada uma. */
  async situacao(organizationId: string, periodo: { de: string; ate: string }) {
    const conexao = await this.prisma.googleAdsConexao.findUnique({ where: { organizationId } });
    const de = new Date(`${periodo.de}T00:00:00.000Z`);
    const ate = new Date(`${periodo.ate}T00:00:00.000Z`);

    const campanhas = await this.prisma.campaign.findMany({
      where: { organizationId, platform: "GOOGLE", manual: false },
      select: {
        id: true,
        externalId: true,
        name: true,
        status: true,
        orcamentoDiarioCentavos: true,
        spend: {
          where: { date: { gte: de, lte: ate } },
          select: {
            spendCents: true,
            impressoes: true,
            cliques: true,
            conversoesNaPlataforma: true,
            valorConversoesCentavos: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const linhas = campanhas
      .map((c) => {
        const soma = (campo: "spendCents" | "impressoes" | "cliques" | "valorConversoesCentavos") =>
          c.spend.reduce((total, dia) => total + (dia[campo] ?? 0), 0);
        const conversoes = Math.round(c.spend.reduce((t, d) => t + (d.conversoesNaPlataforma ?? 0), 0) * 100) / 100;
        return {
          id: c.id,
          idNaPlataforma: c.externalId,
          nome: c.name,
          status: c.status,
          orcamentoDiarioCentavos: c.orcamentoDiarioCentavos,
          gastoCentavos: soma("spendCents"),
          impressoes: soma("impressoes"),
          cliques: soma("cliques"),
          conversoes,
          valorConversoesCentavos: soma("valorConversoesCentavos"),
        };
      })
      // Campanha removida e sem gasto no período é passado; não ocupa a tabela.
      .filter((l) => l.gastoCentavos > 0 || l.status !== "ARCHIVED")
      .sort((a, b) => b.gastoCentavos - a.gastoCentavos);

    const atrasado =
      conexao?.ultimoEnvioEm !== null &&
      conexao?.ultimoEnvioEm !== undefined &&
      Date.now() - conexao.ultimoEnvioEm.getTime() > ENVIO_ATRASADO_EM_HORAS * 60 * 60 * 1000;

    return {
      conexao: conexao
        ? {
            conta: conexao.customerId ? contaLegivel(conexao.customerId) : null,
            nomeDaConta: conexao.nomeDaConta,
            moeda: conexao.moeda,
            ultimoEnvioEm: conexao.ultimoEnvioEm?.toISOString() ?? null,
            atrasado,
            // Script colado antes das ligações e rotas: manda gasto, e só.
            scriptDesatualizado: conexao.ultimoEnvioEm !== null && (conexao.versaoDoScript ?? 1) < VERSAO_DAS_ACOES_LOCAIS,
            // Script anterior ao histórico: só os últimos 35 dias de cada rodada.
            semHistorico: conexao.ultimoEnvioEm !== null && !conexao.historicoCompletoEm && (conexao.versaoDoScript ?? 1) < VERSAO_DO_SCRIPT,
            historicoCompleto: Boolean(conexao.historicoCompletoEm),
            cobertoDesde: conexao.cobertoDesde?.toISOString().slice(0, 10) ?? null,
            partes: (conexao.partesDoScript as Record<string, string> | null) ?? null,
          }
        : null,
      campanhas: linhas,
    };
  }

  /**
   * Recebe um envio do script.
   *
   * A chave diz de qual cliente é, e nada no corpo pode mudar isso. A conta
   * do Google Ads que mandou o primeiro envio fica gravada: a mesma chave
   * vinda de outra conta é recusada, para um script colado na conta errada
   * não misturar as campanhas de dois clientes.
   */
  async recebe(chave: string | undefined, envio: EnvioDoScriptDto) {
    if (!chave || chave.length > 200) throw chaveInvalida();
    const conexao = await this.prisma.googleAdsConexao.findUnique({ where: { chaveHash: hashToken(chave) } });
    if (!conexao) throw chaveInvalida();

    if (conexao.customerId && conexao.customerId !== envio.conta.id) {
      throw new AppException(
        "OUTRA_CONTA",
        `Esta chave é da conta ${contaLegivel(conexao.customerId)}. Gere um script novo na Timeless para ligar outra conta.`,
        HttpStatus.CONFLICT,
      );
    }

    // O período declarado, da versão 3 em diante. Fora de ordem ou maior que
    // o teto é script mexido à mão: recusado, em vez de gravado pela metade.
    const periodo = envio.periodo ? { de: diaUtc(envio.periodo.de), ate: diaUtc(envio.periodo.ate) } : null;
    if (
      periodo &&
      (Number.isNaN(periodo.de.getTime()) ||
        Number.isNaN(periodo.ate.getTime()) ||
        periodo.de > periodo.ate ||
        periodo.ate.getTime() - periodo.de.getTime() > (DIAS_POR_ENVIO - 1) * 86_400_000)
    ) {
      throw new AppException(
        "PERIODO_INVALIDO",
        `O período do envio precisa ter a data inicial antes da final e no máximo ${DIAS_POR_ENVIO} dias.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const organizationId = conexao.organizationId;
    const agora = new Date();

    // Até onde a conta tem dado aqui, que só anda para trás. Na primeira vez
    // com período declarado, o que um script antigo já mandou também conta.
    let cobertoDesde = conexao.cobertoDesde;
    if (periodo && !cobertoDesde) {
      const primeiro = await this.prisma.adSpend.aggregate({
        where: { campaign: { organizationId, platform: "GOOGLE" } },
        _min: { date: true },
      });
      cobertoDesde = primeiro._min.date;
    }
    if (periodo && (!cobertoDesde || periodo.de < cobertoDesde)) cobertoDesde = periodo.de;
    const campanhas = envio.campanhas.map(converteCampanha);
    const medidas = metricasMedidas(envio.partes);
    const locais = converteMetricasLocais(envio.locais, medidas);
    // A janela do envio: o que estiver nela e não vier de novo virou zero. Com
    // o período declarado ela é exata, inclusive nos dias sem linha nenhuma.
    const datas = [...campanhas.flatMap((c) => c.dias.map((d) => d.data)), ...locais.map((l) => l.dia)];
    const janela = periodo
      ? { gte: periodo.de, lte: periodo.ate }
      : datas.length
        ? { gte: new Date(Math.min(...datas.map((d) => d.getTime()))), lte: new Date(Math.max(...datas.map((d) => d.getTime()))) }
        : null;
    let dias = 0;

    await this.prisma.$transaction(
      async (tx) => {
        for (const campanha of campanhas) {
          // A mesma campanha pode ter sido lançada à mão antes, com o id real:
          // ela passa a ser atualizada pelo script, em vez de virar outra linha.
          const linha = await tx.campaign.upsert({
            where: { organizationId_externalId: { organizationId, externalId: campanha.externalId } },
            create: {
              organizationId,
              externalId: campanha.externalId,
              name: campanha.nome,
              status: campanha.status,
              platform: "GOOGLE",
              manual: false,
              orcamentoDiarioCentavos: campanha.orcamentoDiarioCentavos,
              lastSyncedAt: agora,
            },
            update: {
              name: campanha.nome,
              status: campanha.status,
              platform: "GOOGLE",
              manual: false,
              orcamentoDiarioCentavos: campanha.orcamentoDiarioCentavos,
              lastSyncedAt: agora,
            },
          });

          // Em lote: o histórico manda milhares de dias, e uma ida ao banco
          // por dia estourava o tempo da transação.
          for (let inicio = 0; inicio < campanha.dias.length; inicio += LOTE) {
            const lote = campanha.dias.slice(inicio, inicio + LOTE);
            await tx.$executeRaw`
              INSERT INTO "ad_spend" ("id", "campaign_id", "date", "spend_cents", "impressoes", "cliques", "conversoes_na_plataforma", "valor_conversoes_centavos", "updated_at")
              VALUES ${Prisma.join(
                lote.map(
                  (dia) =>
                    Prisma.sql`(${randomUUID()}, ${linha.id}, ${dia.data.toISOString().slice(0, 10)}::date, ${dia.spendCents}, ${dia.impressoes}, ${dia.cliques}, ${dia.conversoesNaPlataforma}, ${dia.valorConversoesCentavos}, now())`,
                ),
              )}
              ON CONFLICT ("campaign_id", "date") DO UPDATE SET
                "spend_cents" = EXCLUDED."spend_cents",
                "impressoes" = EXCLUDED."impressoes",
                "cliques" = EXCLUDED."cliques",
                "conversoes_na_plataforma" = EXCLUDED."conversoes_na_plataforma",
                "valor_conversoes_centavos" = EXCLUDED."valor_conversoes_centavos",
                "updated_at" = now()
            `;
            dias += lote.length;
          }
        }

        // Só as métricas que a parte mediu desta vez são trocadas; as de uma
        // parte que falhou ficam como estavam.
        if (janela && medidas.length) {
          await tx.metricaLocal.deleteMany({
            where: { organizationId, fonte: "GOOGLE_ADS", metrica: { in: medidas }, dia: janela },
          });
          if (locais.length) {
            await tx.metricaLocal.createMany({
              data: locais.map((l) => ({ organizationId, fonte: "GOOGLE_ADS" as const, ...l })),
            });
          }
        }

        await tx.googleAdsConexao.update({
          where: { id: conexao.id },
          data: {
            customerId: envio.conta.id,
            nomeDaConta: envio.conta.nome.slice(0, 255),
            moeda: envio.conta.moeda,
            ultimoEnvioEm: agora,
            // Os blocos do histórico vêm da mesma rodada: a versão e as
            // partes que valem são as da rodada de hora em hora.
            ...(envio.historico
              ? {}
              : {
                  versaoDoScript: envio.versao ?? 1,
                  partesDoScript: (envio.partes ?? Prisma.JsonNull) as Prisma.InputJsonValue | typeof Prisma.JsonNull,
                }),
            ...(periodo ? { cobertoDesde } : {}),
            ...(envio.historicoFim ? { historicoCompletoEm: agora } : {}),
          },
        });
      },
      // Uma conta grande manda milhares de dias; o padrão de 5 s não basta.
      { timeout: 60_000 },
    );

    // O primeiro envio é o momento em que a conta passa a estar ligada de fato.
    if (!conexao.customerId) {
      await this.auditoria.registra(
        { organizationId, userId: null },
        {
          acao: "INTEGRATION_CONNECTED",
          entidade: "GoogleAdsConexao",
          entidadeId: organizationId,
          depois: { integracao: "Google Ads", conta: contaLegivel(envio.conta.id), nomeDaConta: envio.conta.nome },
        },
      );
    }

    return {
      recebido: true,
      campanhas: campanhas.length,
      dias,
      metricasLocais: locais.length,
      // O script da versão 3 lê isto: enquanto for verdade, manda também os
      // 13 meses anteriores na mesma rodada.
      historicoPendente: !conexao.historicoCompletoEm && !envio.historicoFim,
    };
  }
}

const chaveInvalida = () =>
  new AppException(
    "CHAVE_INVALIDA",
    "Chave inválida ou trocada. Gere o script de novo em Integrações → Google Ads.",
    HttpStatus.UNAUTHORIZED,
  );
