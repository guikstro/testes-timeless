import { ORDEM_DO_FUNIL } from "../leads/ordem-do-funil";
import { Injectable } from "@nestjs/common";
import { Lead, MessageDirection } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { matchesTriggerPhrase } from "../common/utils/matches-trigger-phrase";
import { SalesService } from "../sales/sales.service";
import { SaleClassifier } from "../sales/sale-classifier";
import { ConversionEventsService } from "../integrations/meta/conversion-events.service";

export interface ClassifyInput {
  organizationId: string;
  lead: Lead;
  messageId: string;
  messageText: string | undefined;
  occurredAt: Date;
  direction: MessageDirection;
}

/** A mesma ordem do funil do LeadsService: só avança. */
const STATUS_ORDER = ORDEM_DO_FUNIL;

/**
 * Deterministic, rule-based only (Section 62) — no probabilistic/AI
 * classifier in this phase. Runs on every inbound message (not just the
 * first, unlike attribution): qualification/sale can happen at any point in
 * a conversation. Only ever moves a lead forward — NEW -> QUALIFIED -> WON —
 * never backward, and never re-fires once a lead is already WON.
 */
@Injectable()
export class ConversationClassifierService {

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversionEvents: ConversionEventsService,
    private readonly sales: SalesService,
    private readonly saleClassifier: SaleClassifier,
  ) {}

  async classify(input: ClassifyInput): Promise<void> {
    if (!input.messageText) return;

    const rules = await this.prisma.classificationRule.findMany({
      where: { organizationId: input.organizationId },
    });

    const text = input.messageText;
    const match = (target: "QUALIFIED" | "MEETING_SCHEDULED" | "WON") =>
      rules.find((rule) => rule.targetStatus === target && matchesTriggerPhrase(text, rule.phrase));

    // Uma mensagem NOSSA nunca prova qualificação nem venda. Um atendente
    // escrevendo "fechado, te espero" criaria uma venda que não aconteceu, e
    // "vamos marcar sua consulta" qualificaria quem só recebeu uma abordagem.
    // Reunião é a exceção porque quem agenda é justamente o atendente.
    const isOutbound = input.direction === "OUTBOUND";

    const wonRules = rules.filter((rule) => rule.targetStatus === "WON");
    if (wonRules.length) {
      const [organization, message] = await Promise.all([
        this.prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId }, select: { currency: true } }),
        this.prisma.message.findFirst({ where: { id: input.messageId, conversation: { organizationId: input.organizationId } }, include: { conversation: true } }),
      ]);
      const result = await this.saleClassifier.classify({ text, positive: wonRules.map((r) => r.phrase), currency: organization.currency, coverage: message?.conversation.coverage ?? "UNKNOWN" });
      if (result.saleLikely) {
        await this.sales.record({
          organizationId: input.organizationId, leadId: input.lead.id, eventKey: `message:${input.messageId}`,
          source: "CONVERSATION", type: "SALE_INTENT", status: result.confidence >= 0.7 ? "PROBABLE" : "POSSIBLE",
          valueCents: result.valueCents ?? undefined, currency: result.currency, confidence: result.confidence,
          occurredAt: input.occurredAt, payload: { messageId: input.messageId, text, direction: input.direction, reason: result.reason, signals: result.evidence, coverage: message?.conversation.coverage ?? "UNKNOWN" },
        });
      }
    }

    // Antes de qualificação, como WON vem antes das duas: entre dois gatilhos
    // na mesma mensagem, vence o estágio mais avançado.
    if (STATUS_ORDER[input.lead.status] < STATUS_ORDER.MEETING_SCHEDULED) {
      const meetingRule = match("MEETING_SCHEDULED");
      if (meetingRule) {
        await this.markMeetingScheduled(input, meetingRule.id, meetingRule.phrase);
        return;
      }
    }

    // Novo ou em atendimento: responder não qualifica, mas também não impede.
    if (!isOutbound && STATUS_ORDER[input.lead.status] < STATUS_ORDER.QUALIFIED) {
      const qualifiedRule = match("QUALIFIED");
      if (qualifiedRule) {
        await this.markQualified(input, qualifiedRule.id, qualifiedRule.phrase);
      }
    }
  }

  /**
   * Espelha a marcação manual do LeadsService: qualifica implicitamente
   * (combinar horário pressupõe ter qualificado) e desfaz a desqualificação,
   * para automático e manual não divergirem no mesmo funil.
   */
  private async markMeetingScheduled(input: ClassifyInput, ruleId: string, phrase: string): Promise<void> {
    const needsQualification = !input.lead.qualifiedAt;
    const wasDisqualified = Boolean(input.lead.disqualifiedAt);

    await this.prisma.lead.update({
      where: { id: input.lead.id },
      data: {
        status: "MEETING_SCHEDULED",
        meetingScheduledAt: input.occurredAt,
        ...(needsQualification ? { qualifiedAt: input.occurredAt } : {}),
        ...(wasDisqualified ? { disqualifiedAt: null, disqualifiedReason: null } : {}),
      },
    });

    if (needsQualification) {
      await this.prisma.leadEvent.create({
        data: {
          organizationId: input.organizationId,
          leadId: input.lead.id,
          type: "QUALIFIED",
          occurredAt: input.occurredAt,
          metadata: { classifierType: "RULE", implicitFromMeeting: true },
        },
      });
      await this.conversionEvents.recordQualifiedLead(input.organizationId, input.lead.id, input.occurredAt);
    }

    if (wasDisqualified) {
      await this.prisma.leadEvent.create({
        data: {
          organizationId: input.organizationId,
          leadId: input.lead.id,
          type: "REACTIVATED",
          occurredAt: input.occurredAt,
          metadata: { classifierType: "RULE", byProgress: true },
        },
      });
    }

    await this.prisma.leadEvent.create({
      data: {
        organizationId: input.organizationId,
        leadId: input.lead.id,
        type: "MEETING_SCHEDULED",
        occurredAt: input.occurredAt,
        metadata: { classifierType: "RULE", ruleId, phrase, messageId: input.messageId, direction: input.direction },
      },
    });
  }

  private async markQualified(input: ClassifyInput, ruleId: string, phrase: string): Promise<void> {
    await this.prisma.lead.update({
      where: { id: input.lead.id },
      data: { status: "QUALIFIED", qualifiedAt: input.occurredAt },
    });

    await this.prisma.leadEvent.create({
      data: {
        organizationId: input.organizationId,
        leadId: input.lead.id,
        type: "QUALIFIED",
        occurredAt: input.occurredAt,
        metadata: { classifierType: "RULE", ruleId, phrase, messageId: input.messageId },
      },
    });

    await this.conversionEvents.recordQualifiedLead(input.organizationId, input.lead.id, input.occurredAt);
  }

}
