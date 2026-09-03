import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  agregaChegadas,
  aggregateByOrigin,
  aggregateDaily,
  aggregateTotals,
  AggregationLead,
  ComparacaoTotais,
  comparaTotais,
  CelulaDeChegada,
  DailyPoint,
  medianaPrimeiraResposta,
  OriginBucket,
  OverviewTotals,
} from "./overview-aggregation";
import { computeLeadMetrics } from "../leads/lead-metrics";
import { expedienteDa, SELECAO_DE_EXPEDIENTE } from "../common/expediente-da-organizacao";
import { extractAdIds } from "../leads/ad-references";
import { fimDoDia, inicioDoDia } from "../common/tempo";
import {
  agregaDesempenhoPorCampanha,
  CampanhaComparada,
  comparaDesempenho,
  DesempenhoPorCampanha,
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


export interface Janela {
  /** Dia civil no formato YYYY-MM-DD, inclusive nas duas pontas. */
  de: string;
  ate: string;
}

export interface DesempenhoDeCampanhas {
  periodo: Janela;
  comparacao: Janela | null;
  campanhas: CampanhaComparada[];
  semCampanha: { atual: number; anterior: number };
  totais: { gastoCentavos: number; leads: number; vendas: number; receitaCentavos: number };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

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
        select: {
          ...selecao,
          // As mensagens entram só para o tempo de resposta, e só do período
          // atual: comparar mediana de atendimento entre períodos dobraria o
          // custo da consulta para um número que ninguém pediu.
          conversations: {
            select: { messages: { select: { direction: true, timestamp: true, outboundStatus: true }, orderBy: { timestamp: "asc" } } },
          },
        },
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

    const tempos = leads.map((lead) => {
      const mensagens = lead.conversations.flatMap((conversa) => conversa.messages);
      return computeLeadMetrics(lead, mensagens, null, expediente).firstResponseSeconds;
    });
    const respondidos = tempos.filter((t) => t !== null).length;

    const aguardando = leads.filter((lead) => {
      const ultimas = lead.conversations
        .map((conversa) => conversa.messages[conversa.messages.length - 1])
        .filter(Boolean);
      return ultimas.some((mensagem) => mensagem.direction === "INBOUND");
    }).length;

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
    const [atual, anterior] = await Promise.all([
      this.desempenhoNaJanela(organizationId, periodo),
      comparacao
        ? this.desempenhoNaJanela(organizationId, comparacao)
        : Promise.resolve<DesempenhoPorCampanha>({ campanhas: [], semCampanha: 0 }),
    ]);

    const juncao = comparaDesempenho(atual, anterior);

    return {
      periodo,
      comparacao,
      campanhas: juncao.campanhas,
      semCampanha: juncao.semCampanha,
      totais: atual.campanhas.reduce(
        (soma, linha) => ({
          gastoCentavos: soma.gastoCentavos + linha.gastoCentavos,
          leads: soma.leads + linha.leads,
          vendas: soma.vendas + linha.vendas,
          receitaCentavos: soma.receitaCentavos + linha.receitaCentavos,
        }),
        { gastoCentavos: 0, leads: 0, vendas: 0, receitaCentavos: 0 },
      ),
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
          spend: { where: { date: { gte: deDia, lte: ateDia } }, select: { date: true, spendCents: true } },
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

    const atribuidos: LeadAtribuido[] = leads.map((lead) => ({
      // A mesma extração usada na ficha do lead: o id da campanha vem da
      // coluna do clique ou, no caso do CTWA, só do JSON de evidência.
      campaignExternalId: extractAdIds(lead.attribution).campaignId,
      qualifiedAt: lead.qualifiedAt,
      wonAt: lead.wonAt,
      sale: lead.sale,
    }));

    const comAtividade = new Set(atribuidos.map((lead) => lead.campaignExternalId));

    return agregaDesempenhoPorCampanha(
      // Campanha sem gasto e sem lead na janela fica de fora: listá-la diria
      // que ela rodou sem resultado, quando o caso é que ela não rodou.
      campanhas.filter((campanha) => campanha.spend.length > 0 || comAtividade.has(campanha.externalId)),
      atribuidos,
    );
  }
}
