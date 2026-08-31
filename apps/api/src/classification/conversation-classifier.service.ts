import { Injectable, Logger } from "@nestjs/common";
import { Lead, LeadStatus, MessageDirection } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { matchesTriggerPhrase } from "../common/utils/matches-trigger-phrase";
import { extractRevenueCents } from "../common/utils/extract-revenue-cents";
import { isUniqueConstraintError } from "../common/utils/is-unique-constraint-error";
import { ConversionEventsService } from "../integrations/meta/conversion-events.service";

export interface ClassifyInput {
  organizationId: string;
  lead: Lead;
  messageId: string;
  messageText: string | undefined;
  occurredAt: Date;
  direction: MessageDirection;
}

/** Mesma ordem do funil usada pelo LeadsService — só avança. */
const STATUS_ORDER: Record<LeadStatus, number> = {
  NEW: 0,
  QUALIFIED: 1,
  MEETING_SCHEDULED: 2,
  WON: 3,
};

/**
 * Deterministic, rule-based only (Section 62) — no probabilistic/AI
 * classifier in this phase. Runs on every inbound message (not just the
 * first, unlike attribution): qualification/sale can happen at any point in
 * a conversation. Only ever moves a lead forward — NEW -> QUALIFIED -> WON —
 * never backward, and never re-fires once a lead is already WON.
 */
@Injectable()
export class ConversationClassifierService {
  private readonly logger = new Logger(ConversationClassifierService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversionEvents: ConversionEventsService,
  ) {}

  async classify(input: ClassifyInput): Promise<void> {
    if (!input.messageText || input.lead.status === "WON") return;

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

    if (!isOutbound) {
      const wonRule = match("WON");
      if (wonRule) {
        await this.markWon(input, wonRule.id, wonRule.phrase);
        return;
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

    if (!isOutbound && input.lead.status === "NEW") {
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

  private async markWon(input: ClassifyInput, ruleId: string, phrase: string): Promise<void> {
    const wasAlreadyQualified = input.lead.status === "QUALIFIED";
    const revenueCents = extractRevenueCents(input.messageText!);

    await this.prisma.lead.update({
      where: { id: input.lead.id },
      data: {
        status: "WON",
        wonAt: input.occurredAt,
        // A sale implies the person was qualified in some real sense even if
        // no explicit qualification message was ever sent — keeps the
        // Leads -> Qualified -> Sales funnel consistent for later reporting.
        ...(wasAlreadyQualified ? {} : { qualifiedAt: input.occurredAt }),
      },
    });

    if (!wasAlreadyQualified) {
      await this.prisma.leadEvent.create({
        data: {
          organizationId: input.organizationId,
          leadId: input.lead.id,
          type: "QUALIFIED",
          occurredAt: input.occurredAt,
          metadata: { classifierType: "RULE", implicitFromSale: true },
        },
      });
      await this.conversionEvents.recordQualifiedLead(input.organizationId, input.lead.id, input.occurredAt);
    }

    try {
      await this.prisma.sale.create({
        data: {
          organizationId: input.organizationId,
          leadId: input.lead.id,
          amountCents: revenueCents,
          classifierType: "RULE",
          evidenceMessageId: input.messageId,
          detectedAt: input.occurredAt,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // Lost a race with another message that also matched a WON trigger
        // for this lead — one sale per lead, first one wins.
        this.logger.log(JSON.stringify({ event: "duplicate_sale_skipped", leadId: input.lead.id }));
        return;
      }
      throw error;
    }

    await this.prisma.leadEvent.create({
      data: {
        organizationId: input.organizationId,
        leadId: input.lead.id,
        type: "SALE_DETECTED",
        occurredAt: input.occurredAt,
        metadata: { classifierType: "RULE", ruleId, phrase, messageId: input.messageId },
      },
    });

    if (revenueCents !== null) {
      await this.prisma.leadEvent.create({
        data: {
          organizationId: input.organizationId,
          leadId: input.lead.id,
          type: "REVENUE_DETECTED",
          occurredAt: input.occurredAt,
          metadata: { amountCents: revenueCents, messageId: input.messageId },
        },
      });
      // Only sent once a value is actually known (Section: never guess) —
      // a sale detected without a value waits for a manual correction to
      // set one (see LeadsService.update) before Meta ever hears about it.
      await this.conversionEvents.recordPurchase(input.organizationId, input.lead.id, input.occurredAt, revenueCents);
    }
  }
}
