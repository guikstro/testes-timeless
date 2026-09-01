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

    const [leads, anteriores, whatsapp, meta, trackingLinkCount] = await Promise.all([
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
    ]);

    // A venda é 1:1 com o lead, mas só conta aqui se não foi removida:
    // `sale` já vem null para vendas apagadas por causa do soft delete.
    const aggregationLeads = leads as unknown as AggregationLead[];
    const totals = aggregateTotals(aggregationLeads);

    const tempos = leads.map((lead) => {
      const mensagens = lead.conversations.flatMap((conversa) => conversa.messages);
      return computeLeadMetrics(lead, mensagens, null).firstResponseSeconds;
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
}
