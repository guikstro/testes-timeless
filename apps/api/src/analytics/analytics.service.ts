import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  agregaChegadas,
  aggregateByOrigin,
  aggregateDaily,
  aggregateTotals,
  AggregationLead,
  classifyOrigin,
  ComparacaoTotais,
  comparaTotais,
  CelulaDeChegada,
  DailyPoint,
  medianaPrimeiraResposta,
  OriginBucket,
  OverviewTotals,
} from "./overview-aggregation";
import { MetricsMessage, computeLeadMetrics } from "../leads/lead-metrics";
import { AtendimentoDoLead, atendimentoPorLead } from "./atendimento-por-lead";
import { expedienteDa, SELECAO_DE_EXPEDIENTE } from "../common/expediente-da-organizacao";
import { extractAdIds } from "../leads/ad-references";
import {
  agregaDesempenhoPorAnuncio,
  GastoDoAnuncio,
  LeadDoAnuncio,
} from "./desempenho-por-anuncio";
import { fimDoDia, inicioDoDia, diaCivilLocal, FUSO, hojeLocal } from "../common/tempo";
import { gastoPorDia, medidoAte } from "./gasto-por-dia";
import { identificacaoDosLeads, LeadIdentificado, MetodoDeIdentificacao } from "./identificacao-dos-leads";
import { completaIdsDoAnuncio, HierarquiaDoAnuncio } from "./vinculo-do-anuncio";
import { frescorDaMeta, frescorDaPagina, frescorDoGoogle } from "./frescor";
import {
  aplicaFiltros,
  FiltrosDoFunil,
  FunilMontado,
  LeadRecortavel,
  montaFunil,
  OpcaoDeFiltro,
  opcoesDosFiltros,
  SEM_CAMPANHA,
} from "./funil";
import { FunilQueryDto } from "./dto/funil-query.dto";
import { diasDa, janelas } from "../presenca-local/calculo";
import { Cobertura, coberturaDeTodas, comecaAntes, diasAntes } from "../common/cobertura";
import {
  LinhaGuardada,
  porDiaDaPagina,
  resumoDaPagina,
  ResumoDaPagina,
  visualizadoresUnicos,
  VisualizadoresUnicos,
  DiaDaPagina,
} from "./pagina";
import {
  agregaDesempenhoPorCampanha,
  CampanhaComparada,
  comparaDesempenho,
  completaEntregaPelosAnuncios,
  DesempenhoPorCampanha,
  entregaDaCampanha,
  LeadAtribuido,
} from "./campaign-performance";

export interface Overview {
  period: { days: number; from: string; to: string };
  totals: OverviewTotals;
  /** Mesmos números do período imediatamente anterior, para a tela mostrar variação. */
  comparacao: ComparacaoTotais;
  byOrigin: OriginBucket[];
  daily: DailyPoint[];
  chegadas: CelulaDeChegada[];
  atendimento: {
    medianaPrimeiraRespostaSegundos: number | null;
    respondidos: number;
    semResposta: number;
    aguardando: number;
  };
  setup: { whatsappConnected: boolean; metaConnected: boolean; trackingLinkCount: number };
}

export interface FunilDoPeriodo {
  periodo: { de: string; ate: string; dias: number };
  /** Os recortes como chegaram, com "eu" ainda como "eu": é o que a tela precisa marcar na lista. */
  filtros: { campanha: string | null; origem: string | null; responsavel: string | null };
  /** Leads do período antes dos recortes, para a tela dizer "12 dos 40". */
  totalNoPeriodo: number;
  funil: FunilMontado;
  opcoes: {
    campanhas: OpcaoDeFiltro[];
    origens: OpcaoDeFiltro[];
    responsaveis: { id: string; name: string }[];
  };
}

export interface InsightsDaPagina {
  periodo: { de: string; ate: string };
  anterior: { de: string; ate: string };
  /** Null quando nenhuma Página foi escolhida em Integrações. */
  pagina: { id: string; nome: string | null; sincronizadaEm: string | null; erro: string | null } | null;
  atual: ResumoDaPagina;
  /** O período anterior do mesmo tamanho, para a variação. */
  comparacao: ResumoDaPagina;
  visualizadores: { semana: VisualizadoresUnicos | null; mes: VisualizadoresUnicos | null };
  porDia: DiaDaPagina[];
}

export interface Janela {
  /** Dia civil no formato YYYY-MM-DD, inclusive nas duas pontas. */
  de: string;
  ate: string;
}

export interface DesempenhoDeCampanhas {
  periodo: Janela;
  comparacao: Janela | null;
  /** Desde quando os anúncios da conta têm dado aqui. */
  cobertura: Cobertura;
  /** O período e a comparação começam antes da cobertura: têm dias sem dado. */
  parcial: { atual: boolean; comparacao: boolean };
  campanhas: CampanhaComparada[];
  semCampanha: { atual: number; anterior: number };
  totais: {
    gastoCentavos: number;
    leads: number;
    vendas: number;
    receitaCentavos: number;
    /** Null quando nenhuma campanha do período trouxe a contagem da plataforma. */
    conversasNaPlataforma: number | null;
    /** Entrega somada: null quando nenhuma campanha trouxe o número. */
    impressoes: number | null;
    cliques: number | null;
    entregaCompleta: boolean;
    ctr: number | null;
    cpmCentavos: number | null;
    cpcCentavos: number | null;
    custoPorConversaCentavos: number | null;
  };
}

/**
 * As duas mensagens que o cálculo de primeira resposta realmente olha.
 *
 * Reconstruídas a partir das datas agregadas, em vez de reimplementar a
 * conta aqui: assim o tempo de resposta da tela e o da ficha do lead saem da
 * mesma função, incluindo a proteção contra intervalo negativo e o desconto
 * de expediente. Duas cópias da mesma regra envelheceriam separadas.
 */
function mensagensDoAtendimento(atendimento: AtendimentoDoLead | undefined): MetricsMessage[] {
  if (!atendimento) return [];
  const mensagens: MetricsMessage[] = [];
  if (atendimento.primeiroRecebido) {
    mensagens.push({ direction: "INBOUND", timestamp: atendimento.primeiroRecebido, outboundStatus: null });
  }
  if (atendimento.primeiraResposta) {
    mensagens.push({ direction: "OUTBOUND", timestamp: atendimento.primeiraResposta, outboundStatus: "SENT" });
  }
  return mensagens;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /** De quando é o último dado de cada fonte de gasto, para a tela dizer se o número é de agora. */
  async frescor(organizationId: string) {
    const [meta, google] = await Promise.all([
      this.prisma.metaConnection.findUnique({
        where: { organizationId },
        select: {
          status: true,
          lastSyncedAt: true,
          lastSyncError: true,
          paginaId: true,
          paginaSincronizadaEm: true,
          paginaErro: true,
        },
      }),
      this.prisma.googleAdsConexao.findUnique({ where: { organizationId }, select: { ultimoEnvioEm: true } }),
    ]);
    return { meta: frescorDaMeta(meta), google: frescorDoGoogle(google), pagina: frescorDaPagina(meta) };
  }

  /**
   * Os Insights da Página do Facebook no período, e no período anterior do
   * mesmo tamanho, para a tela mostrar a variação como a Meta mostra.
   */
  async pagina(organizationId: string, dias: number): Promise<InsightsDaPagina> {
    const { atual, anterior } = janelas(hojeLocal(), dias);
    const conexao = await this.prisma.metaConnection.findUnique({
      where: { organizationId },
      select: { status: true, paginaId: true, paginaNome: true, paginaSincronizadaEm: true, paginaErro: true },
    });

    if (!conexao?.paginaId || conexao.status === "DISCONNECTED") {
      const vazio = resumoDaPagina([], atual);
      return {
        periodo: atual,
        anterior,
        pagina: null,
        atual: vazio,
        comparacao: vazio,
        visualizadores: { semana: null, mes: null },
        porDia: [],
      };
    }

    // O dia é um dia civil sem hora, guardado à meia-noite UTC como o gasto.
    const guardadas = await this.prisma.metricaDaPagina.findMany({
      where: {
        organizationId,
        paginaId: conexao.paginaId,
        dia: { gte: new Date(`${anterior.de}T00:00:00.000Z`), lte: new Date(`${atual.ate}T00:00:00.000Z`) },
      },
      select: { metrica: true, dia: true, valor: true },
    });
    const linhas: LinhaGuardada[] = guardadas.map((linha) => ({
      metrica: linha.metrica,
      dia: linha.dia.toISOString().slice(0, 10),
      valor: linha.valor,
    }));

    return {
      periodo: atual,
      anterior,
      pagina: {
        id: conexao.paginaId,
        nome: conexao.paginaNome,
        sincronizadaEm: conexao.paginaSincronizadaEm?.toISOString() ?? null,
        erro: conexao.paginaErro,
      },
      atual: resumoDaPagina(linhas, atual),
      comparacao: resumoDaPagina(linhas, anterior),
      visualizadores: visualizadoresUnicos(linhas, atual),
      porDia: porDiaDaPagina(linhas, diasDa(atual)),
    };
  }

  async overview(organizationId: string, days: number): Promise<Overview> {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);

    // Janela anterior de mesmo tamanho, colada na atual: é o que dá sentido a
    // "subiu 15%", em vez de um número solto sem referência.
    const anteriorAte = new Date(from.getTime() - 1);
    const anteriorDe = new Date(from);
    anteriorDe.setDate(anteriorDe.getDate() - days);

    const selecao = {
      status: true,
      firstContactAt: true,
      qualifiedAt: true,
      wonAt: true,
      meetingScheduledAt: true,
      disqualifiedAt: true,
      sale: { select: { amountCents: true } },
      attribution: {
        select: {
          method: true,
          trackingClick: { select: { utmSource: true, trackingLink: { select: { name: true } } } },
        },
      },
    } as const;

    const [leads, anteriores, whatsapp, meta, trackingLinkCount, organizacao] = await Promise.all([
      // Só as colunas que a agregação lê. Carregar o lead inteiro traria a
      // conversa junto e tornaria o custo da tela proporcional ao volume de
      // mensagens, não ao de leads.
      this.prisma.lead.findMany({
        where: { organizationId, firstContactAt: { gte: from, lte: to } },
        // O `id` entra para o atendimento ser buscado depois, agregado no
        // banco, em vez de vir junto como a conversa inteira.
        select: { ...selecao, id: true },
      }),
      this.prisma.lead.findMany({
        where: { organizationId, firstContactAt: { gte: anteriorDe, lte: anteriorAte } },
        select: selecao,
      }),
      this.prisma.whatsAppConnection.findUnique({
        where: { organizationId },
        select: { status: true },
      }),
      this.prisma.metaConnection.findUnique({
        where: { organizationId },
        select: { status: true },
      }),
      this.prisma.trackingLink.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: SELECAO_DE_EXPEDIENTE }),
    ]);

    // A mediana da tela precisa da mesma conta da ficha do lead, ou os dois
    // lugares diriam números diferentes para a mesma espera.
    const expediente = expedienteDa(organizacao);

    // A venda é 1:1 com o lead, mas só conta aqui se não foi removida:
    // `sale` já vem null para vendas apagadas por causa do soft delete.
    const aggregationLeads = leads as unknown as AggregationLead[];
    const totals = aggregateTotals(aggregationLeads);

    /*
      As mensagens não vêm mais para cá.

      Esta tela usava toda mensagem de toda conversa de todo lead da janela
      para responder duas perguntas: quanto a equipe demorou para responder, e
      se a bola está com ela agora. Na base atual isso é treze vezes mais
      linha do que lead, e um único lead conversador domina a tela inteira.
      Agora o banco devolve três datas por lead, e a conta continua sendo
      feita pela mesma função da ficha do lead, com as duas mensagens que ela
      de fato olha. Assim o número da tela e o da ficha não podem divergir.
    */
    const atendimentoDosLeads = await atendimentoPorLead(this.prisma, leads.map((lead) => lead.id));

    const tempos = leads.map((lead) => {
      const atendimento = atendimentoDosLeads.get(lead.id);
      return computeLeadMetrics(lead, mensagensDoAtendimento(atendimento), null, expediente).firstResponseSeconds;
    });
    const respondidos = tempos.filter((t) => t !== null).length;

    const aguardando = leads.filter(
      (lead) => atendimentoDosLeads.get(lead.id)?.ultimoSentido === "INBOUND",
    ).length;

    return {
      period: { days, from: from.toISOString(), to: to.toISOString() },
      totals,
      comparacao: comparaTotais(totals, aggregateTotals(anteriores as unknown as AggregationLead[])),
      byOrigin: aggregateByOrigin(aggregationLeads),
      daily: aggregateDaily(aggregationLeads, from, to),
      chegadas: agregaChegadas(aggregationLeads),
      atendimento: {
        medianaPrimeiraRespostaSegundos: medianaPrimeiraResposta(tempos),
        respondidos,
        semResposta: leads.length - respondidos,
        aguardando,
      },
      // Sem isto a tela não consegue explicar *por que* a origem está vazia,
      // e um dashboard que mostra "origem desconhecida: 100%" sem dizer o que
      // fazer a respeito é só uma constatação inútil.
      setup: {
        whatsappConnected: whatsapp?.status === "CONNECTED",
        metaConnected: meta?.status === "CONNECTED",
        trackingLinkCount,
      },
    };
  }

  /**
   * O funil dos leads que chegaram no período, com recorte por campanha,
   * origem e responsável.
   *
   * Os recortes são aplicados aqui, sobre a lista já carregada, e não no
   * `where`: as opções de cada filtro saem do período inteiro, e a campanha
   * de um lead de Click-to-WhatsApp só é conhecida depois de subir do anúncio
   * para a campanha, o que o banco não sabe fazer num filtro.
   */
  async funil(organizationId: string, userId: string, query: FunilQueryDto): Promise<FunilDoPeriodo> {
    const dias = query.days ?? 30;
    // Dias civis de Brasília: um lead das 22h é de hoje, não de amanhã.
    const { de, ate } = janelas(hojeLocal(), dias).atual;

    const [leads, membros] = await Promise.all([
      this.prisma.lead.findMany({
        where: { organizationId, firstContactAt: { gte: inicioDoDia(de), lte: fimDoDia(ate) } },
        select: {
          id: true,
          status: true,
          emAtendimentoAt: true,
          disqualifiedAt: true,
          disqualifiedReason: true,
          responsavelId: true,
          attribution: {
            select: {
              method: true,
              evidence: true,
              trackingClick: {
                select: {
                  utmSource: true,
                  campaignId: true,
                  adsetId: true,
                  adId: true,
                  trackingLink: { select: { name: true } },
                },
              },
            },
          },
        },
      }),
      this.prisma.membership.findMany({
        where: { organizationId, user: { deletedAt: null } },
        select: { user: { select: { id: true, name: true } } },
      }),
    ]);

    // A mesma subida do anúncio para a campanha do desempenho por campanha:
    // um lead não pode estar numa campanha lá e em nenhuma aqui.
    const idsBrutos = leads.map((lead) => extractAdIds(lead.attribution));
    const hierarquia = await this.hierarquiaDosAnuncios(
      organizationId,
      [...new Set(idsBrutos.map((ids) => ids.adId).filter((id): id is string => id !== null))],
    );
    const campanhaDe = idsBrutos.map((ids) => completaIdsDoAnuncio(ids, hierarquia).campaignId);

    // A resposta da equipe só decide alguma coisa para quem continua em Novo
    // sem nunca ter entrado em atendimento; os outros já provam o contato
    // pelo estágio, e a consulta não precisa olhar as mensagens deles.
    const semSinalDeContato = leads
      .filter((lead) => lead.status === "NEW" && lead.emAtendimentoAt === null)
      .map((lead) => lead.id);
    const atendimento = await atendimentoPorLead(this.prisma, semSinalDeContato);

    const recortaveis: LeadRecortavel[] = leads.map((lead, i) => ({
      status: lead.status,
      emAtendimentoAt: lead.emAtendimentoAt,
      respondido: Boolean(atendimento.get(lead.id)?.primeiraResposta),
      disqualifiedAt: lead.disqualifiedAt,
      disqualifiedReason: lead.disqualifiedReason,
      campanhaId: campanhaDe[i],
      origem: classifyOrigin(lead),
      responsavelId: lead.responsavelId,
    }));

    const escolhidos = {
      campanha: query.campanha?.trim() || null,
      origem: query.origem?.trim() || null,
      responsavel: query.responsavel?.toLowerCase() || null,
    };
    const filtros: FiltrosDoFunil = {
      ...escolhidos,
      responsavel: escolhidos.responsavel === "eu" ? userId : escolhidos.responsavel,
    };

    // Os nomes vêm só de campanhas desta organização: um id de outra conta
    // aparece cru, nunca com o nome que ela deu.
    const idsDeCampanha = new Set(campanhaDe.filter((id): id is string => id !== null));
    if (filtros.campanha !== null && filtros.campanha !== SEM_CAMPANHA) idsDeCampanha.add(filtros.campanha);
    const campanhas =
      idsDeCampanha.size > 0
        ? await this.prisma.campaign.findMany({
            where: { organizationId, externalId: { in: [...idsDeCampanha] } },
            select: { externalId: true, name: true },
          })
        : [];

    return {
      periodo: { de, ate, dias },
      filtros: escolhidos,
      totalNoPeriodo: recortaveis.length,
      funil: montaFunil(aplicaFiltros(recortaveis, filtros)),
      opcoes: {
        ...opcoesDosFiltros(
          recortaveis,
          new Map(campanhas.map((campanha) => [campanha.externalId, campanha.name])),
          filtros,
        ),
        responsaveis: membros
          .map((membro) => membro.user)
          .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
      },
    };
  }

  /**
   * De cada anúncio sincronizado, a que conjunto e campanha ele pertence.
   *
   * Uma consulta só para todos os leads da janela, em vez de uma por lead. O
   * escopo desce pela campanha porque `Ad` e `AdSet` não carregam
   * organização: filtrar aqui, dentro da consulta, é o que impede um id de
   * outra conta de resolver para o nome da campanha dela.
   */
  private async hierarquiaDosAnuncios(
    organizationId: string,
    externalIds: string[],
  ): Promise<Map<string, HierarquiaDoAnuncio>> {
    if (externalIds.length === 0) return new Map();

    const anuncios = await this.prisma.ad.findMany({
      where: { externalId: { in: externalIds }, adSet: { campaign: { organizationId } } },
      select: {
        externalId: true,
        adSet: { select: { externalId: true, campaign: { select: { externalId: true } } } },
      },
    });

    return new Map(
      anuncios.map((anuncio) => [
        anuncio.externalId,
        {
          campaignExternalId: anuncio.adSet.campaign.externalId,
          adSetExternalId: anuncio.adSet.externalId,
        },
      ]),
    );
  }

  /**
   * Desempenho por campanha em dois períodos escolhidos à mão.
   *
   * Períodos livres, e não uma janela de "últimos N dias", porque uma
   * organização roda campanhas diferentes em meses diferentes: nenhuma janela
   * contada a partir de hoje consegue isolar a campanha que rodou em março, e
   * comparar março com julho é a pergunta que se faz de verdade.
   */
  async desempenhoPorCampanha(
    organizationId: string,
    periodo: Janela,
    comparacao: Janela | null,
  ): Promise<DesempenhoDeCampanhas> {
    const [atual, anterior, cobertura] = await Promise.all([
      this.desempenhoNaJanela(organizationId, periodo),
      comparacao
        ? this.desempenhoNaJanela(organizationId, comparacao)
        : Promise.resolve<DesempenhoPorCampanha>({ campanhas: [], semCampanha: 0, entrega: entregaDaCampanha([]) }),
      this.coberturaDosAnuncios(organizationId),
    ]);

    const juncao = comparaDesempenho(atual, anterior);

    return {
      periodo,
      comparacao,
      cobertura,
      parcial: { atual: comecaAntes(periodo, cobertura.desde), comparacao: comecaAntes(comparacao, cobertura.desde) },
      campanhas: juncao.campanhas,
      semCampanha: juncao.semCampanha,
      totais: {
        ...atual.campanhas.reduce(
          (soma, linha) => ({
            gastoCentavos: soma.gastoCentavos + linha.gastoCentavos,
            leads: soma.leads + linha.leads,
            vendas: soma.vendas + linha.vendas,
            receitaCentavos: soma.receitaCentavos + linha.receitaCentavos,
            // Só soma quem tem o número: uma campanha de CSV não conta conversa
            // nenhuma, e isso não pode apagar a contagem das que contam.
            conversasNaPlataforma:
              linha.conversasNaPlataforma === null
                ? soma.conversasNaPlataforma
                : (soma.conversasNaPlataforma ?? 0) + linha.conversasNaPlataforma,
          }),
          {
            gastoCentavos: 0,
            leads: 0,
            vendas: 0,
            receitaCentavos: 0,
            conversasNaPlataforma: null as number | null,
          },
        ),
        impressoes: atual.entrega.impressoes,
        cliques: atual.entrega.cliques,
        entregaCompleta: atual.entrega.completa,
        ctr: atual.entrega.ctr,
        cpmCentavos: atual.entrega.cpmCentavos,
        cpcCentavos: atual.entrega.cpcCentavos,
        custoPorConversaCentavos: atual.entrega.custoPorConversaCentavos,
      },
    };
  }

  /**
   * Desde quando os anúncios da conta têm dado aqui.
   *
   * A Meta é buscada a partir da conexão, com 7 dias para trás; o Google, a
   * partir do período que o script declarou (ou, nos scripts antigos, do
   * primeiro dia com gasto). Com as duas, vale a mais recente: antes dela, o
   * total de um período não está inteiro. O gasto já guardado de antes (de
   * uma conexão anterior, ou lançado à mão) também conta como coberto.
   */
  private async coberturaDosAnuncios(organizationId: string): Promise<Cobertura> {
    const [meta, google, primeiroDaMeta, primeiroDoGoogle] = await Promise.all([
      this.prisma.metaConnection.findUnique({ where: { organizationId }, select: { status: true, connectedAt: true } }),
      this.prisma.googleAdsConexao.findUnique({
        where: { organizationId },
        select: { ultimoEnvioEm: true, cobertoDesde: true, historicoCompletoEm: true },
      }),
      this.prisma.adSpend.aggregate({ where: { campaign: { organizationId, platform: "META" } }, _min: { date: true } }),
      this.prisma.adSpend.aggregate({ where: { campaign: { organizationId, platform: "GOOGLE" } }, _min: { date: true } }),
    ]);
    const dia = (data: Date | null | undefined) => data?.toISOString().slice(0, 10) ?? null;

    const daMeta =
      meta && meta.status !== "DISCONNECTED"
        ? coberturaMaisAntiga(diasAntes(diaCivilLocal(meta.connectedAt, FUSO), INSIGHTS_LOOKBACK_DAYS), dia(primeiroDaMeta._min.date))
        : null;
    const doGoogle = google?.ultimoEnvioEm ? (dia(google.cobertoDesde) ?? dia(primeiroDoGoogle._min.date)) : null;
    const desde = coberturaDeTodas([daMeta, doGoogle]);
    return {
      desde,
      limitadaPor: desde === null ? null : desde === doGoogle ? "GOOGLE" : "META",
      googleSemHistorico: Boolean(google?.ultimoEnvioEm && !google.historicoCompletoEm),
    };
  }

  /**
   * Uma janela só, já cruzada.
   *
   * As duas pontas são montadas em fusos diferentes de propósito, e a
   * diferença não é descuido:
   *
   * - O lead é um instante, então a janela dele vai da meia-noite à meia-noite
   *   no horário de Brasília. Em UTC, um lead das 22h cairia no dia seguinte.
   * - O gasto é um dia civil sem hora, gravado na meia-noite UTC. A janela
   *   dele acompanha esse mesmo eixo, ou nenhuma linha casaria.
   */
  private async desempenhoNaJanela(organizationId: string, janela: Janela): Promise<DesempenhoPorCampanha> {
    const de = inicioDoDia(janela.de);
    const ate = fimDoDia(janela.ate);
    const deDia = new Date(`${janela.de}T00:00:00.000Z`);
    const ateDia = new Date(`${janela.ate}T00:00:00.000Z`);

    const [campanhas, leads] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { organizationId },
        select: {
          id: true,
          externalId: true,
          name: true,
          platform: true,
          status: true,
          criadaNaPlataformaEm: true,
          objetivo: true,
          spend: {
            where: { date: { gte: deDia, lte: ateDia } },
            select: { date: true, spendCents: true, conversasIniciadas: true, impressoes: true, cliques: true },
          },
        },
      }),
      this.prisma.lead.findMany({
        where: { organizationId, firstContactAt: { gte: de, lte: ate } },
        select: {
          qualifiedAt: true,
          wonAt: true,
          sale: { select: { amountCents: true } },
          attribution: {
            select: {
              evidence: true,
              trackingClick: { select: { campaignId: true, adsetId: true, adId: true } },
            },
          },
        },
      }),
    ]);

    /*
      Sobe do anúncio para a campanha antes de agregar.

      Sem isto, todo lead vindo de Click-to-WhatsApp entrava com campanha nula
      e sumia deste relatório, embora a ficha do próprio lead mostrasse o nome
      da campanha: a Meta manda só o id do anúncio no referral, e a hierarquia
      só estava sendo resolvida na tela do lead.
    */
    const idsBrutos = leads.map((lead) => extractAdIds(lead.attribution));
    const hierarquia = await this.hierarquiaDosAnuncios(
      organizationId,
      [...new Set(idsBrutos.map((ids) => ids.adId).filter((id): id is string => id !== null))],
    );

    const atribuidos: LeadAtribuido[] = leads.map((lead, i) => ({
      campaignExternalId: completaIdsDoAnuncio(idsBrutos[i], hierarquia).campaignId,
      qualifiedAt: lead.qualifiedAt,
      wonAt: lead.wonAt,
      sale: lead.sale,
    }));

    const comAtividade = new Set(atribuidos.map((lead) => lead.campaignExternalId));

    // Os dias anteriores a a Meta gravar a entrega no gasto da campanha: a
    // soma dos anúncios da campanha naquele dia é o mesmo número.
    const entregaDosAnuncios = campanhas.some((campanha) => campanha.spend.some((linha) => linha.impressoes === null))
      ? await this.entregaPorCampanhaEDia(organizationId, deDia, ateDia)
      : new Map<string, { impressoes: number; cliques: number }>();

    return agregaDesempenhoPorCampanha(
      // Campanha sem gasto e sem lead na janela fica de fora: listá-la diria
      // que ela rodou sem resultado, quando o caso é que ela não rodou.
      completaEntregaPelosAnuncios(
        campanhas.filter((campanha) => campanha.spend.length > 0 || comAtividade.has(campanha.externalId)),
        entregaDosAnuncios,
      ),
      atribuidos,
    );
  }

  /**
   * Impressões e cliques dos anúncios, somados por campanha e dia.
   *
   * O escopo desce pela campanha, como em todo número por anúncio: anúncio e
   * conjunto não carregam organização, e filtrar aqui é o que impede alcançar
   * a conta alheia.
   */
  private async entregaPorCampanhaEDia(
    organizationId: string,
    deDia: Date,
    ateDia: Date,
  ): Promise<Map<string, { impressoes: number; cliques: number }>> {
    const linhas = await this.prisma.adInsight.findMany({
      where: { date: { gte: deDia, lte: ateDia }, ad: { adSet: { campaign: { organizationId } } } },
      select: { date: true, impressions: true, clicks: true, ad: { select: { adSet: { select: { campaignId: true } } } } },
    });

    const porCampanhaEDia = new Map<string, { impressoes: number; cliques: number }>();
    for (const linha of linhas) {
      const chave = `${linha.ad.adSet.campaignId}|${linha.date.toISOString().slice(0, 10)}`;
      const acumulado = porCampanhaEDia.get(chave) ?? { impressoes: 0, cliques: 0 };
      porCampanhaEDia.set(chave, {
        impressoes: acumulado.impressoes + linha.impressions,
        cliques: acumulado.cliques + linha.clicks,
      });
    }
    return porCampanhaEDia;
  }

  /**
   * Desempenho por anúncio, numa janela.
   *
   * A consulta de leads é a mesma do desempenho por campanha, de propósito: o
   * clique guarda os três ids, então trocar o agrupamento não custa consulta
   * nenhuma e garante que os dois níveis contem a mesma história. Se um lead
   * aparece numa campanha aqui e não lá, é defeito, não arredondamento.
   */
  async desempenhoPorAnuncio(organizationId: string, janela: Janela) {
    const de = inicioDoDia(janela.de);
    const ate = fimDoDia(janela.ate);
    const deDia = new Date(`${janela.de}T00:00:00.000Z`);
    const ateDia = new Date(`${janela.ate}T00:00:00.000Z`);

    const [linhas, leads, conexao] = await Promise.all([
      this.prisma.adInsight.findMany({
        // O escopo desce pela campanha: anúncio e conjunto não carregam
        // organização, e filtrar aqui é o que impede alcançar a conta alheia.
        where: { date: { gte: deDia, lte: ateDia }, ad: { adSet: { campaign: { organizationId } } } },
        select: {
          date: true,
          spendCents: true,
          impressions: true,
          clicks: true,
          ad: {
            select: {
              id: true,
              externalId: true,
              name: true,
              status: true,
              adSet: { select: { campaign: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.lead.findMany({
        where: { organizationId, firstContactAt: { gte: de, lte: ate } },
        select: {
          qualifiedAt: true,
          wonAt: true,
          sale: { select: { amountCents: true } },
          attribution: {
            select: {
              // O método entra aqui para a tela poder dizer *como* cada lead
              // foi identificado. Sem ele, "sem anúncio" vira uma categoria só
              // e some a diferença entre não ter evidência e ter evidência que
              // não chega ao nível do criativo.
              method: true,
              evidence: true,
              trackingClick: { select: { campaignId: true, adsetId: true, adId: true } },
            },
          },
        },
      }),
      /*
        De quando é o número, e se a fonte dele está de pé.

        Sem isto a tela mostra um gasto sem dizer de quando ele é, e a
        sincronia roda de hora em hora e pode estar quebrada: o painel
        continuaria exibindo o valor velho com cara de atual. Um filtro ou uma
        procedência não declarada é a causa mais comum de discussão numa
        reunião com o cliente.
      */
      this.prisma.metaConnection.findUnique({
        where: { organizationId },
        select: { status: true, lastSyncedAt: true, lastSyncError: true },
      }),
    ]);

    // As linhas vêm por dia; a tela quer o período. A soma acontece aqui e
    // não no banco porque o nome do anúncio e da campanha vêm na mesma
    // viagem, e agrupar no SQL exigiria repeti-los em cada linha.
    const porAnuncio = new Map<string, GastoDoAnuncio>();
    for (const linha of linhas) {
      const chave = linha.ad.externalId;
      const atual = porAnuncio.get(chave);
      if (atual) {
        atual.spendCents += linha.spendCents;
        atual.impressions += linha.impressions;
        atual.clicks += linha.clicks;
        continue;
      }
      porAnuncio.set(chave, {
        adId: linha.ad.id,
        externalId: linha.ad.externalId,
        name: linha.ad.name,
        status: linha.ad.status,
        campanha: linha.ad.adSet.campaign.name,
        spendCents: linha.spendCents,
        impressions: linha.impressions,
        clicks: linha.clicks,
      });
    }

    const atribuidos: LeadDoAnuncio[] = leads.map((lead) => ({
      adExternalId: extractAdIds(lead.attribution).adId,
      qualifiedAt: lead.qualifiedAt,
      wonAt: lead.wonAt,
      sale: lead.sale,
    }));

    /*
      Quantos leads a tabela acima consegue de fato mostrar.

      Sem esta conta a tela engana de um jeito específico: o lead que não pôde
      ser ligado a um anúncio não aparece em linha nenhuma, e o cliente lê
      "estes anúncios trouxeram doze leads" quando a verdade é "doze dos
      quarenta puderam ser ligados a um anúncio".

      `anuncioConhecido` compara contra os anúncios que gastaram na janela,
      que é exatamente o conjunto de linhas desenhadas na tabela.
    */
    const identificados: LeadIdentificado[] = leads.map((lead) => {
      const adExternalId = extractAdIds(lead.attribution).adId;
      return {
        metodo: (lead.attribution?.method as MetodoDeIdentificacao | undefined) ?? null,
        adExternalId,
        anuncioConhecido: adExternalId !== null && porAnuncio.has(adExternalId),
      };
    });

    const gastosDiarios = linhas.map((linha) => ({ date: linha.date, spendCents: linha.spendCents }));

    return {
      periodo: janela,
      ...agregaDesempenhoPorAnuncio([...porAnuncio.values()], atribuidos),
      identificacao: identificacaoDosLeads(identificados),
      /*
        O extrato dia a dia, montado das mesmas linhas já carregadas acima:
        `adInsight` vem por anúncio e por dia, e a soma por dia não custa outra
        viagem ao banco.

        O limite da medição não é hoje, é até onde a fonte chegou: se a
        sincronia parou anteontem, os dois últimos dias não gastaram zero, eles
        não foram medidos. Ver `medidoAte`.

        Dois tipos de data convivem nesta chamada e não podem ser confundidos.
        `lastSyncedAt` é instante e vira dia civil no fuso do cliente; as datas
        de gasto já são dia civil em UTC e não passam por conversão nenhuma.
      */
      porDia: gastoPorDia(
        gastosDiarios,
        janela,
        medidoAte(
          gastosDiarios,
          conexao?.lastSyncedAt ? diaCivilLocal(conexao.lastSyncedAt, FUSO) : null,
          diaCivilLocal(new Date(), FUSO),
        ),
      ),
      procedencia: {
        fonte: conexao ? "Meta Ads" : null,
        sincronizadoEm: conexao?.lastSyncedAt?.toISOString() ?? null,
        // A tela precisa distinguir "nunca sincronizou" de "sincronizou e
        // quebrou": o segundo significa que o número na tela está velho.
        status: conexao?.status ?? null,
        erro: conexao?.lastSyncError ?? null,
      },
    };
  }
}

/** Os dias que a sincronia da Meta busca para trás na conexão. Ver `MetaSyncService`. */
const INSIGHTS_LOOKBACK_DAYS = 7;

/** A mais antiga de duas datas conhecidas: dado guardado de antes também é cobertura. */
function coberturaMaisAntiga(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

