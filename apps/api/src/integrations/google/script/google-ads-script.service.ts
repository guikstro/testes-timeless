import { HttpStatus, Injectable } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AppException } from "../../../common/exceptions/app-exception";
import { hashToken } from "../../../common/utils/hash-token";
import { enderecoPublico } from "../../../common/configuracao/ambiente";
import { AuditoriaService, Autor } from "../../../auditoria/auditoria.service";
import { contaLegivel, converteCampanha } from "./converte-envio";
import { scriptDoGoogleAds } from "./script-do-google-ads";
import { EnvioDoScriptDto } from "./envio.dto";

/** Sem envio há mais que isto, a tela avisa que o script parou. */
const ENVIO_ATRASADO_EM_HORAS = 3;

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

    const organizationId = conexao.organizationId;
    const agora = new Date();
    const campanhas = envio.campanhas.map(converteCampanha);
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

          for (const dia of campanha.dias) {
            const { data, ...numeros } = dia;
            await tx.adSpend.upsert({
              where: { campaignId_date: { campaignId: linha.id, date: data } },
              create: { campaignId: linha.id, date: data, ...numeros },
              update: numeros,
            });
            dias += 1;
          }
        }

        await tx.googleAdsConexao.update({
          where: { id: conexao.id },
          data: {
            customerId: envio.conta.id,
            nomeDaConta: envio.conta.nome.slice(0, 255),
            moeda: envio.conta.moeda,
            ultimoEnvioEm: agora,
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

    return { recebido: true, campanhas: campanhas.length, dias };
  }
}

const chaveInvalida = () =>
  new AppException(
    "CHAVE_INVALIDA",
    "Chave inválida ou trocada. Gere o script de novo em Integrações → Google Ads.",
    HttpStatus.UNAUTHORIZED,
  );
