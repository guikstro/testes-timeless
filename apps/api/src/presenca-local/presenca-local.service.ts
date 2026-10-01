import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { hojeLocal } from "../common/tempo";
import { METRICAS_DA_PARTE } from "../integrations/google/script/converte-envio";
import { VERSAO_DAS_ACOES_LOCAIS } from "../integrations/google/script/script-do-google-ads";
import { custoPor, diasDa, Janela, janelas, janelasDoPerfil } from "./calculo";
import { VISUALIZACOES } from "../integrations/perfil-da-empresa/metricas-do-perfil";
import { Cobertura, comecaAntes } from "../common/cobertura";

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

type Par = { atual: number | null; anterior: number | null };

/** O que a tela mostra do Perfil da Empresa. As visualizações são as quatro somadas. */
const NUMEROS_DO_PERFIL = ["LIGACOES", "ROTAS", "CLIQUES_NO_SITE", "CONVERSAS", "RESERVAS", "VISUALIZACOES", "VISUALIZACOES_MAPS", "VISUALIZACOES_BUSCA"] as const;
type NumeroDoPerfil = (typeof NUMEROS_DO_PERFIL)[number];

/** De quais métricas guardadas cada número da tela sai. */
const METRICAS_DO_NUMERO: Record<NumeroDoPerfil, string[]> = {
  LIGACOES: ["LIGACOES"],
  ROTAS: ["ROTAS"],
  CLIQUES_NO_SITE: ["CLIQUES_NO_SITE"],
  CONVERSAS: ["CONVERSAS"],
  RESERVAS: ["RESERVAS"],
  VISUALIZACOES: VISUALIZACOES,
  VISUALIZACOES_MAPS: ["VISUALIZACOES_MAPS_CELULAR", "VISUALIZACOES_MAPS_COMPUTADOR"],
  VISUALIZACOES_BUSCA: ["VISUALIZACOES_BUSCA_CELULAR", "VISUALIZACOES_BUSCA_COMPUTADOR"],
};

/** O que uma campanha fez numa janela. Ligação e rota são `null` quando não medidas. */
interface LinhaDaCampanha {
  externalId: string;
  nome: string;
  status: string;
  gastoCentavos: number;
  cliques: number;
  impressoes: number;
  ligacoes: number | null;
  rotas: number | null;
}

interface Medicao {
  situacao: "sem-google-ads" | "script-desatualizado" | "parcial" | "medido";
  partes: Record<string, string>;
  ultimoEnvioEm: string | null;
  temGoogle: boolean;
  medida: (metrica: Metrica) => boolean;
  /**
   * Desde quando a conta tem dado do Google aqui, e se o histórico de 13
   * meses já chegou. Antes de `desde`, um período não tem número nenhum, e
   * compará-lo com um período inteiro mostraria altas que não aconteceram.
   */
  cobertura: Cobertura;
}


const dataDe = (dia: string) => new Date(`${dia}T00:00:00.000Z`);
const arredonda = (valor: number) => Math.round(valor * 100) / 100;

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
    const medicao = await this.medicao(organizationId);

    const [metricasAtual, metricasAnterior, somaAtual, somaAnterior, campanhas, perfil] = await Promise.all([
      this.metricasPorDia(organizationId, atual),
      this.metricasPorDia(organizationId, anterior),
      this.somaDoGoogle(organizationId, atual),
      this.somaDoGoogle(organizationId, anterior),
      this.porCampanha(organizationId, atual, medicao),
      this.doPerfil(organizationId, atual, anterior),
    ]);

    const total = (linhas: { metrica: string; valor: number }[], metrica: Metrica) =>
      medicao.medida(metrica) ? arredonda(linhas.filter((l) => l.metrica === metrica).reduce((s, l) => s + l.valor, 0)) : null;

    const totais = Object.fromEntries(
      METRICAS.map((m) => [m, { atual: total(metricasAtual, m), anterior: total(metricasAnterior, m) }]),
    ) as Record<Metrica, Par>;

    const investimento = {
      atual: medicao.temGoogle ? somaAtual.gastoCentavos : null,
      anterior: medicao.temGoogle ? somaAnterior.gastoCentavos : null,
    };

    return {
      periodo: atual,
      periodoAnterior: anterior,
      situacao: medicao.situacao,
      partes: medicao.partes,
      ultimoEnvioEm: medicao.ultimoEnvioEm,
      cobertura: medicao.cobertura,
      parcial: { atual: comecaAntes(atual, medicao.cobertura.desde), comparacao: comecaAntes(anterior, medicao.cobertura.desde) },
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
        const soma = (m: Metrica) => (medicao.medida(m) ? doDia.filter((l) => l.metrica === m).reduce((s, l) => s + l.valor, 0) : null);
        return { dia, ligacoes: soma("LIGACOES_DOS_ANUNCIOS"), rotas: soma("ROTAS") };
      }),
      campanhas,
      perfil,
    };
  }

  /**
   * O Perfil da Empresa no Google no período: o que o Google conta no perfil,
   * na Busca e no Maps. Null quando a equipe não escolheu perfil para o
   * cliente.
   *
   * O Google libera esses números com uns três dias de atraso: o período vai
   * até onde ele já contou, e a comparação usa os mesmos dias do período
   * anterior. Só conta local ligado agora: o número de um local tirado do
   * cliente não aparece, nem enquanto a faxina não passa.
   */
  private async doPerfil(organizationId: string, atual: Janela, anterior: Janela) {
    const locais = await this.prisma.localDoPerfil.findMany({
      where: { organizationId },
      select: { localId: true, nome: true, numerosAte: true, sincronizadoEm: true, erro: true },
      orderBy: { nome: "asc" },
    });
    if (locais.length === 0) return null;

    const ids = locais.map((local) => local.localId);
    const dia = (data: Date | null) => data?.toISOString().slice(0, 10) ?? null;
    // Com mais de um local, vale o que todos já contaram.
    const contados = locais.map((local) => dia(local.numerosAte));
    const numerosAte = contados.includes(null) ? null : contados.sort()[0];
    const cabecalhoDoPerfil = {
      locais: locais.map((local) => ({ nome: local.nome, numerosAte: dia(local.numerosAte) })),
      numerosAte,
      /** Algum local ainda não foi lido: o histórico está chegando. */
      lendo: locais.some((local) => local.sincronizadoEm === null && local.erro === null),
      /** O motivo fica na tela da equipe; o cliente só precisa saber que parou. */
      comProblema: locais.some((local) => local.erro !== null),
    };

    const janelasCortadas = janelasDoPerfil(atual, anterior, numerosAte);
    if (!janelasCortadas) return { ...cabecalhoDoPerfil, periodo: null, periodoAnterior: null, totais: null, serie: [] };

    const [linhas, primeiro] = await Promise.all([
      this.prisma.metricaLocal.findMany({
        where: {
          organizationId,
          fonte: "PERFIL_DA_EMPRESA",
          escopo: { in: ids },
          dia: { gte: dataDe(janelasCortadas.anterior.de), lte: dataDe(janelasCortadas.atual.ate) },
        },
        select: { metrica: true, dia: true, valor: true },
      }),
      this.prisma.metricaLocal.aggregate({
        where: { organizationId, fonte: "PERFIL_DA_EMPRESA", escopo: { in: ids } },
        _min: { dia: true },
      }),
    ]);
    const doDia = linhas.map((l) => ({ metrica: l.metrica, dia: l.dia.toISOString().slice(0, 10), valor: l.valor }));
    const soma = (janela: Janela, numero: NumeroDoPerfil, de = janela.de, ate = janela.ate) =>
      arredonda(
        doDia
          .filter((l) => l.dia >= de && l.dia <= ate && METRICAS_DO_NUMERO[numero].includes(l.metrica))
          .reduce((total, l) => total + l.valor, 0),
      );

    // O período anterior começando antes do primeiro dia lido não tem com o que comparar.
    const comparavel = !comecaAntes(janelasCortadas.anterior, dia(primeiro._min.dia));
    const totais = Object.fromEntries(
      NUMEROS_DO_PERFIL.map((numero) => [
        numero,
        { atual: soma(janelasCortadas.atual, numero), anterior: comparavel ? soma(janelasCortadas.anterior, numero) : null },
      ]),
    ) as Record<NumeroDoPerfil, Par>;

    return {
      ...cabecalhoDoPerfil,
      periodo: janelasCortadas.atual,
      periodoAnterior: comparavel ? janelasCortadas.anterior : null,
      totais,
      serie: diasDa(janelasCortadas.atual).map((d) => ({
        dia: d,
        ligacoes: soma(janelasCortadas.atual, "LIGACOES", d, d),
        rotas: soma(janelasCortadas.atual, "ROTAS", d, d),
        visualizacoes: soma(janelasCortadas.atual, "VISUALIZACOES", d, d),
      })),
    };
  }

  /**
   * Cada campanha do Google num período livre, com a comparação escolhida à
   * mão, para a tela de campanhas andar mês a mês como a de leads.
   *
   * A campanha que só rodou na comparação continua na lista, com `atual`
   * nulo: "não rodou" é metade da explicação de uma queda.
   */
  async campanhas(organizationId: string, periodo: Janela, comparacao: Janela | null) {
    const medicao = await this.medicao(organizationId);
    const [linhasAtuais, linhasAnteriores, resumoAtual, resumoAnterior] = await Promise.all([
      this.porCampanha(organizationId, periodo, medicao),
      comparacao ? this.porCampanha(organizationId, comparacao, medicao) : Promise.resolve(null),
      this.resumo(organizationId, periodo, medicao),
      comparacao ? this.resumo(organizationId, comparacao, medicao) : Promise.resolve(null),
    ]);

    const anteriores = new Map((linhasAnteriores ?? []).map((l) => [l.externalId, l]));
    const atuais = new Set(linhasAtuais.map((l) => l.externalId));
    const campanhas = [
      ...linhasAtuais.map((l) => ({ ...cabecalho(l), atual: numeros(l), anterior: anteriores.has(l.externalId) ? numeros(anteriores.get(l.externalId)!) : null })),
      ...(linhasAnteriores ?? [])
        .filter((l) => !atuais.has(l.externalId))
        .map((l) => ({ ...cabecalho(l), atual: null, anterior: numeros(l) })),
    ];

    const par = (campo: keyof typeof resumoAtual): Par => ({ atual: resumoAtual[campo], anterior: resumoAnterior ? resumoAnterior[campo] : null });

    return {
      periodo,
      comparacao,
      situacao: medicao.situacao,
      partes: medicao.partes,
      ultimoEnvioEm: medicao.ultimoEnvioEm,
      cobertura: medicao.cobertura,
      parcial: { atual: comecaAntes(periodo, medicao.cobertura.desde), comparacao: comecaAntes(comparacao, medicao.cobertura.desde) },
      totais: {
        gastoCentavos: par("gastoCentavos"),
        cliques: par("cliques"),
        impressoes: par("impressoes"),
        ligacoes: par("ligacoes"),
        rotas: par("rotas"),
        custoPorLigacao: par("custoPorLigacao"),
        custoPorRota: par("custoPorRota"),
      },
      campanhas,
    };
  }

  /** Se o script manda ligações e rotas, e o que isso quer dizer para a tela. */
  private async medicao(organizationId: string): Promise<Medicao> {
    const conexao = await this.prisma.googleAdsConexao.findUnique({
      where: { organizationId },
      select: { ultimoEnvioEm: true, versaoDoScript: true, partesDoScript: true, cobertoDesde: true, historicoCompletoEm: true },
    });

    // O script da versão 3 diz o período que cobriu. Os anteriores não
    // diziam, e o primeiro dia com gasto é a melhor pista que sobra.
    let desde = conexao?.cobertoDesde?.toISOString().slice(0, 10) ?? null;
    if (!desde && conexao?.ultimoEnvioEm) {
      const primeiro = await this.prisma.adSpend.aggregate({
        where: { campaign: { organizationId, platform: "GOOGLE" } },
        _min: { date: true },
      });
      desde = primeiro._min.date?.toISOString().slice(0, 10) ?? null;
    }

    const partes = (conexao?.partesDoScript as Record<string, string> | null) ?? {};
    const versao = conexao?.versaoDoScript ?? 1;
    const medida = (metrica: Metrica) => versao >= VERSAO_DAS_ACOES_LOCAIS && partes[PARTE_DA_METRICA[metrica]] === "ok";
    const situacao = !conexao?.ultimoEnvioEm
      ? "sem-google-ads"
      : versao < VERSAO_DAS_ACOES_LOCAIS
        ? "script-desatualizado"
        : METRICAS.every(medida)
          ? "medido"
          : "parcial";

    return {
      situacao,
      partes,
      ultimoEnvioEm: conexao?.ultimoEnvioEm?.toISOString() ?? null,
      temGoogle: Boolean(conexao?.ultimoEnvioEm),
      medida,
      cobertura: {
        desde,
        limitadaPor: desde ? "GOOGLE" : null,
        googleSemHistorico: Boolean(conexao?.ultimoEnvioEm && !conexao.historicoCompletoEm),
      },
    };
  }

  /** Os totais de uma janela, do jeito que a tela de campanhas mostra. */
  private async resumo(organizationId: string, janela: Janela, medicao: Medicao) {
    const [soma, metricas] = await Promise.all([this.somaDoGoogle(organizationId, janela), this.metricasPorDia(organizationId, janela)]);
    const total = (metrica: Metrica) =>
      medicao.medida(metrica) ? arredonda(metricas.filter((l) => l.metrica === metrica).reduce((s, l) => s + l.valor, 0)) : null;
    const gastoCentavos = medicao.temGoogle ? soma.gastoCentavos : null;
    const ligacoes = total("LIGACOES_DOS_ANUNCIOS");
    const rotas = total("ROTAS");
    return {
      gastoCentavos,
      cliques: medicao.temGoogle ? soma.cliques : null,
      impressoes: medicao.temGoogle ? soma.impressoes : null,
      ligacoes,
      rotas,
      custoPorLigacao: custoPor(gastoCentavos, ligacoes),
      custoPorRota: custoPor(gastoCentavos, rotas),
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

  /** Gasto, cliques e impressões das campanhas do Google na janela. */
  private async somaDoGoogle(organizationId: string, janela: Janela) {
    const soma = await this.prisma.adSpend.aggregate({
      where: {
        campaign: { organizationId, platform: "GOOGLE" },
        date: { gte: dataDe(janela.de), lte: dataDe(janela.ate) },
      },
      _sum: { spendCents: true, cliques: true, impressoes: true },
    });
    return {
      gastoCentavos: soma._sum.spendCents ?? 0,
      cliques: soma._sum.cliques ?? 0,
      impressoes: soma._sum.impressoes ?? 0,
    };
  }

  /** Cada campanha do Google no período: quanto gastou e o que trouxe. */
  private async porCampanha(organizationId: string, janela: Janela, medicao: Medicao): Promise<LinhaDaCampanha[]> {
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
    const daCampanha = (externalId: string, metrica: Metrica) =>
      medicao.medida(metrica)
        ? arredonda(metricas.find((m) => m.escopo === externalId && m.metrica === metrica)?._sum.valor ?? 0)
        : null;

    return campanhas
      .map((c) => ({
        externalId: c.externalId,
        nome: c.name,
        status: c.status,
        gastoCentavos: c.spend.reduce((s, d) => s + d.spendCents, 0),
        cliques: c.spend.reduce((s, d) => s + (d.cliques ?? 0), 0),
        impressoes: c.spend.reduce((s, d) => s + (d.impressoes ?? 0), 0),
        ligacoes: daCampanha(c.externalId, "LIGACOES_DOS_ANUNCIOS"),
        rotas: daCampanha(c.externalId, "ROTAS"),
      }))
      .filter((c) => c.gastoCentavos > 0 || (c.ligacoes ?? 0) > 0 || (c.rotas ?? 0) > 0)
      .sort((a, b) => b.gastoCentavos - a.gastoCentavos);
  }
}

const cabecalho = (l: LinhaDaCampanha) => ({ externalId: l.externalId, nome: l.nome, status: l.status });

const numeros = (l: LinhaDaCampanha) => ({
  gastoCentavos: l.gastoCentavos,
  cliques: l.cliques,
  impressoes: l.impressoes,
  ligacoes: l.ligacoes,
  rotas: l.rotas,
  custoPorLigacao: custoPor(l.gastoCentavos, l.ligacoes),
  custoPorRota: custoPor(l.gastoCentavos, l.rotas),
});
