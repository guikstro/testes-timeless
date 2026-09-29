import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { hojeLocal } from "../common/tempo";
import { METRICAS_DA_PARTE } from "../integrations/google/script/converte-envio";
import { VERSAO_DO_SCRIPT } from "../integrations/google/script/script-do-google-ads";
import { custoPor, diasDa, Janela, janelas } from "./calculo";

/** As métricas que o painel mostra, e de qual parte do script cada uma vem. */
const METRICAS = ["LIGACOES_DOS_ANUNCIOS", "LIGACOES_CONVERSAO", "ROTAS", "VISITAS_A_LOJA", "EXIBICOES_DO_TELEFONE"] as const;
type Metrica = (typeof METRICAS)[number];

const PARTE_DA_METRICA: Record<Metrica, keyof typeof METRICAS_DA_PARTE> = {
  LIGACOES_DOS_ANUNCIOS: "ligacoes",
  EXIBICOES_DO_TELEFONE: "ligacoes",
  LIGACOES_CONVERSAO: "acoesLocais",
  ROTAS: "acoesLocais",
  VISITAS_A_LOJA: "acoesLocais",
};

const dataDe = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

/**
 * O painel de quem vive de presença local: ligações, pedidos de rota e visitas
 * que os anúncios do Google trouxeram, quanto isso custou, e a comparação com
 * o período anterior.
 *
 * Medida e ausência não se confundem: uma métrica cuja parte do script não
 * está chegando (script antigo, ou o Google recusou a consulta) volta `null`,
 * e a tela escreve "sem medida". Zero é zero.
 */
@Injectable()
export class PresencaLocalService {
  constructor(private readonly prisma: PrismaService) {}

  async painel(organizationId: string, dias: number, hoje = hojeLocal()) {
    const { atual, anterior } = janelas(hoje, dias);
    const conexao = await this.prisma.googleAdsConexao.findUnique({
      where: { organizationId },
      select: { ultimoEnvioEm: true, versaoDoScript: true, partesDoScript: true },
    });

    const partes = (conexao?.partesDoScript as Record<string, string> | null) ?? {};
    const medida = (metrica: Metrica) => (conexao?.versaoDoScript ?? 1) >= VERSAO_DO_SCRIPT && partes[PARTE_DA_METRICA[metrica]] === "ok";
    const situacao = !conexao?.ultimoEnvioEm
      ? "sem-google-ads"
      : (conexao.versaoDoScript ?? 1) < VERSAO_DO_SCRIPT
        ? "script-desatualizado"
        : METRICAS.every(medida)
          ? "medido"
          : "parcial";

    const [metricasAtual, metricasAnterior, gastoAtual, gastoAnterior, campanhas] = await Promise.all([
      this.metricasPorDia(organizationId, atual),
      this.metricasPorDia(organizationId, anterior),
      this.gasto(organizationId, atual),
      this.gasto(organizationId, anterior),
      this.porCampanha(organizationId, atual),
    ]);

    const total = (linhas: { metrica: string; valor: number }[], metrica: Metrica) =>
      medida(metrica) ? Math.round(linhas.filter((l) => l.metrica === metrica).reduce((s, l) => s + l.valor, 0) * 100) / 100 : null;

    const totais = Object.fromEntries(
      METRICAS.map((m) => [m, { atual: total(metricasAtual, m), anterior: total(metricasAnterior, m) }]),
    ) as Record<Metrica, { atual: number | null; anterior: number | null }>;

    const temGoogle = Boolean(conexao?.ultimoEnvioEm);
    const investimento = { atual: temGoogle ? gastoAtual : null, anterior: temGoogle ? gastoAnterior : null };

    return {
      periodo: atual,
      periodoAnterior: anterior,
      situacao,
      partes,
      ultimoEnvioEm: conexao?.ultimoEnvioEm?.toISOString() ?? null,
      totais,
      investimento,
      custo: {
        porLigacao: {
          atual: custoPor(investimento.atual, totais.LIGACOES_DOS_ANUNCIOS.atual),
          anterior: custoPor(investimento.anterior, totais.LIGACOES_DOS_ANUNCIOS.anterior),
        },
        porRota: {
          atual: custoPor(investimento.atual, totais.ROTAS.atual),
          anterior: custoPor(investimento.anterior, totais.ROTAS.anterior),
        },
      },
      serie: diasDa(atual).map((dia) => {
        const doDia = metricasAtual.filter((l) => l.dia === dia);
        const soma = (m: Metrica) => (medida(m) ? doDia.filter((l) => l.metrica === m).reduce((s, l) => s + l.valor, 0) : null);
        return { dia, ligacoes: soma("LIGACOES_DOS_ANUNCIOS"), rotas: soma("ROTAS") };
      }),
      campanhas,
    };
  }

  private async metricasPorDia(organizationId: string, janela: Janela) {
    const linhas = await this.prisma.metricaLocal.findMany({
      where: {
        organizationId,
        fonte: "GOOGLE_ADS",
        metrica: { in: [...METRICAS] },
        dia: { gte: dataDe(janela.de), lte: dataDe(janela.ate) },
      },
      select: { metrica: true, dia: true, valor: true },
    });
    return linhas.map((l) => ({ metrica: l.metrica, dia: l.dia.toISOString().slice(0, 10), valor: l.valor }));
  }

  private async gasto(organizationId: string, janela: Janela): Promise<number> {
    const soma = await this.prisma.adSpend.aggregate({
      where: {
        campaign: { organizationId, platform: "GOOGLE" },
        date: { gte: dataDe(janela.de), lte: dataDe(janela.ate) },
      },
      _sum: { spendCents: true },
    });
    return soma._sum.spendCents ?? 0;
  }

  /** Cada campanha do Google no período: quanto gastou e o que trouxe. */
  private async porCampanha(organizationId: string, janela: Janela) {
    const de = dataDe(janela.de);
    const ate = dataDe(janela.ate);
    const [campanhas, metricas] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { organizationId, platform: "GOOGLE" },
        select: {
          externalId: true,
          name: true,
          status: true,
          spend: { where: { date: { gte: de, lte: ate } }, select: { spendCents: true, cliques: true, impressoes: true } },
        },
      }),
      this.prisma.metricaLocal.groupBy({
        by: ["escopo", "metrica"],
        where: { organizationId, fonte: "GOOGLE_ADS", dia: { gte: de, lte: ate } },
        _sum: { valor: true },
      }),
    ]);
    const daCampanha = (externalId: string | null, metrica: string) =>
      metricas.find((m) => m.escopo === externalId && m.metrica === metrica)?._sum.valor ?? 0;

    return campanhas
      .map((c) => ({
        nome: c.name,
        status: c.status,
        gastoCentavos: c.spend.reduce((s, d) => s + d.spendCents, 0),
        cliques: c.spend.reduce((s, d) => s + (d.cliques ?? 0), 0),
        impressoes: c.spend.reduce((s, d) => s + (d.impressoes ?? 0), 0),
        ligacoes: daCampanha(c.externalId, "LIGACOES_DOS_ANUNCIOS"),
        rotas: daCampanha(c.externalId, "ROTAS"),
      }))
      .filter((c) => c.gastoCentavos > 0 || c.ligacoes > 0 || c.rotas > 0)
      .sort((a, b) => b.gastoCentavos - a.gastoCentavos);
  }
}
