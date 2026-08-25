import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ConversionEventType } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { isUniqueConstraintError } from "../../common/utils/is-unique-constraint-error";
import { PaginatedResult, PaginationQueryDto } from "../../common/dto/pagination.dto";
import { META_CONVERSIONS_QUEUE } from "../../common/queue/queue.constants";
import { MetaConversionSendJob } from "../../common/queue/meta-conversion-send.job";

const SEND_JOB_OPTS = { attempts: 5, backoff: { type: "exponential" as const, delay: 5000 }, removeOnComplete: true, removeOnFail: 20 };

interface RecordInput {
  organizationId: string;
  leadId: string;
  type: ConversionEventType;
  occurredAt: Date;
  valueCents?: number;
}

/**
 * Records the domain facts Meta needs to hear about (a lead was created,
 * qualified, or bought) as `ConversionEvent` rows and enqueues them for
 * delivery — see docs/META_CAPI.md. Never records anything for an
 * organization that has never connected Meta Ads at all (Section: no
 * backfill — old events are useless to Meta past its 7-day event_time
 * window anyway, and there is nothing to attribute them to).
 */
@Injectable()
export class ConversionEventsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(META_CONVERSIONS_QUEUE) private readonly conversionQueue: Queue<MetaConversionSendJob>,
  ) {}

  recordLead(organizationId: string, leadId: string, occurredAt: Date): Promise<void> {
    return this.record({ organizationId, leadId, type: "LEAD", occurredAt });
  }

  recordQualifiedLead(organizationId: string, leadId: string, occurredAt: Date): Promise<void> {
    return this.record({ organizationId, leadId, type: "QUALIFIED_LEAD", occurredAt });
  }

  /** Never call this with an unknown value — see docs/META_CAPI.md for why a Purchase is only ever recorded once its value is known. */
  recordPurchase(organizationId: string, leadId: string, occurredAt: Date, valueCents: number): Promise<void> {
    return this.record({ organizationId, leadId, type: "PURCHASE", occurredAt, valueCents });
  }

  async list(organizationId: string, pagination: PaginationQueryDto) {
    const offset = pagination.offset ?? 0;
    const limit = pagination.limit ?? 20;

    const [items, total] = await Promise.all([
      this.prisma.conversionEvent.findMany({
        where: { organizationId },
        include: { lead: { select: { id: true, name: true, normalizedPhone: true } } },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      this.prisma.conversionEvent.count({ where: { organizationId } }),
    ]);

    return { items, total, offset, limit } satisfies PaginatedResult<unknown>;
  }

  /**
   * Re-enqueues anything that never got to Meta — called after (re)connecting
   * CAPI (Section: FAILED is only recoverable by fixing the connection, not
   * by BullMQ's own retries, which are already exhausted by then).
   */
  async drainPending(organizationId: string): Promise<void> {
    const events = await this.prisma.conversionEvent.findMany({
      where: { organizationId, status: { in: ["PENDING", "FAILED"] } },
      select: { id: true },
    });

    for (const event of events) {
      await this.conversionQueue.add("send", { conversionEventId: event.id }, SEND_JOB_OPTS);
    }
  }

  private async record(input: RecordInput): Promise<void> {
    const connection = await this.prisma.metaConnection.findUnique({ where: { organizationId: input.organizationId } });
    if (!connection) return;

    let event;
    try {
      event = await this.prisma.conversionEvent.create({
        data: {
          organizationId: input.organizationId,
          leadId: input.leadId,
          type: input.type,
          valueCents: input.valueCents ?? null,
          currency: input.valueCents !== undefined ? await this.currencyFor(input.organizationId) : null,
          occurredAt: input.occurredAt,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) return; // already recorded for this (lead, type) — never resend/overwrite
      throw error;
    }

    await this.conversionQueue.add("send", { conversionEventId: event.id }, SEND_JOB_OPTS);
  }

  private async currencyFor(organizationId: string): Promise<string> {
    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    return organization.currency;
  }
}
