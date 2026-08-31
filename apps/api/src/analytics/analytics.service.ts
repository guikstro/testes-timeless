import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  aggregateByOrigin,
  aggregateDaily,
  aggregateTotals,
  AggregationLead,
  DailyPoint,
  OriginBucket,
  OverviewTotals,
} from "./overview-aggregation";

export interface Overview {
  period: { days: number; from: string; to: string };
  totals: OverviewTotals;
  byOrigin: OriginBucket[];
  daily: DailyPoint[];
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

    const [leads, whatsapp, meta, trackingLinkCount] = await Promise.all([
      // Só as colunas que a agregação lê. Carregar o lead inteiro traria a
      // conversa junto e tornaria o custo da tela proporcional ao volume de
      // mensagens, não ao de leads.
      this.prisma.lead.findMany({
        where: { organizationId, firstContactAt: { gte: from, lte: to } },
        select: {
          status: true,
          firstContactAt: true,
          meetingScheduledAt: true,
          disqualifiedAt: true,
          sale: { select: { amountCents: true } },
          attribution: {
            select: {
              method: true,
              trackingClick: { select: { utmSource: true, trackingLink: { select: { name: true } } } },
            },
          },
        },
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

    // A venda é 1:1 com o lead, mas só conta aqui se não foi removida —
    // `sale` já vem null para vendas apagadas por causa do soft delete.
    const aggregationLeads = leads as unknown as AggregationLead[];

    return {
      period: { days, from: from.toISOString(), to: to.toISOString() },
      totals: aggregateTotals(aggregationLeads),
      byOrigin: aggregateByOrigin(aggregationLeads),
      daily: aggregateDaily(aggregationLeads, from, to),
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
