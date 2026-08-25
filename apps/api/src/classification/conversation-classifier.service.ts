import { Injectable, Logger } from "@nestjs/common";
import { Lead } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { matchesTriggerPhrase } from "../common/utils/matches-trigger-phrase";
import { extractRevenueCents } from "../common/utils/extract-revenue-cents";
import { isUniqueConstraintError } from "../common/utils/is-unique-constraint-error";

export interface ClassifyInput {
  organizationId: string;
  lead: Lead;
  messageId: string;
  messageText: string | undefined;
  occurredAt: Date;
}

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

  constructor(private readonly prisma: PrismaService) {}

  async classify(input: ClassifyInput): Promise<void> {
    if (!input.messageText || input.lead.status === "WON") return;

    const rules = await this.prisma.classificationRule.findMany({
      where: { organizationId: input.organizationId },
    });

    const wonRule = rules.find(
      (rule) => rule.targetStatus === "WON" && matchesTriggerPhrase(input.messageText!, rule.phrase),
    );
    if (wonRule) {
      await this.markWon(input, wonRule.id, wonRule.phrase);
      return;
    }

    if (input.lead.status === "NEW") {
      const qualifiedRule = rules.find(
        (rule) => rule.targetStatus === "QUALIFIED" && matchesTriggerPhrase(input.messageText!, rule.phrase),
      );
      if (qualifiedRule) {
        await this.markQualified(input, qualifiedRule.id, qualifiedRule.phrase);
      }
    }
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
    }
  }
}
