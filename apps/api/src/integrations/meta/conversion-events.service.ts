import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import { Queue } from "bullmq";
import { ConversionEventType, Prisma, Sale } from "@prisma/client";
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
  saleId?: string;
  currency?: string;
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
export class ConversionEventsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private draining = false;
  private readonly logger = new Logger(ConversionEventsService.name);

  onModuleInit() {
    this.timer = setInterval(() => void this.recoverOutbox(), 30000);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private async recoverOutbox() {
    if (this.draining) return;
    this.draining = true;
    try {
      const events = await this.prisma.conversionEvent.findMany({ where: { status: "PENDING" }, orderBy: { createdAt: "asc" }, take: 100 });
      for (const event of events) await this.enqueue(event.id);
    } catch { this.logger.warn("conversion_outbox_retry_pending"); }
    finally { this.draining = false; }
  }

  private async enqueue(id: string) {
    const job = await this.conversionQueue.getJob(id);
    if (job && await job.getState() === "failed") { await job.retry(); return; }
    await this.conversionQueue.add("send", { conversionEventId: id }, { ...SEND_JOB_OPTS, jobId: id });
  }

  /** Purchase outbox is committed in the same transaction as the confirmed sale. */
  async stageConfirmedSale(tx: Prisma.TransactionClient, sale: Sale) {
    if (sale.status !== "CONFIRMED" || sale.needsReview || !sale.leadId || sale.amountCents === null || sale.deletedAt) return;
    if (!await tx.metaConnection.findUnique({ where: { organizationId: sale.organizationId } })) return;
    const existing = await tx.conversionEvent.findFirst({ where: { organizationId: sale.organizationId, saleId: sale.id, type: "PURCHASE" } });
    if (existing) {
      // Keep sent facts and their Meta IDs immutable. Correct an unsent purchase atomically.
      await tx.conversionEvent.updateMany({ where: { id: existing.id, status: { in: ["PENDING", "FAILED"] } }, data: {
        leadId: sale.leadId, valueCents: sale.amountCents, currency: sale.currency,
        occurredAt: sale.occurredAt ?? sale.detectedAt, status: "PENDING", lastError: null,
      } });
      return;
    }
    await tx.conversionEvent.create({ data: { organizationId: sale.organizationId, leadId: sale.leadId, saleId: sale.id,
      deduplicationKey: `sale:${sale.id}:PURCHASE`, type: "PURCHASE", valueCents: sale.amountCents, currency: sale.currency, occurredAt: sale.occurredAt ?? sale.detectedAt } });
  }
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
  async recordPurchase(organizationId: string, leadId: string, _occurredAt: Date, _valueCents: number): Promise<void> {
    const sale = await this.prisma.sale.findFirst({ where: { organizationId, leadId, status: "CONFIRMED", needsReview: false, deletedAt: null }, orderBy: { createdAt: "desc" } });
    if (sale) await this.recordConfirmedSale(organizationId, sale.id);
  }

  async recordConfirmedSale(organizationId: string, saleId: string): Promise<void> {
    const sale = await this.prisma.sale.findFirst({ where: { id: saleId, organizationId, status: "CONFIRMED", needsReview: false, deletedAt: null } });
    if (!sale?.leadId || sale.amountCents === null) return;
    const existing = await this.prisma.conversionEvent.findFirst({ where: { organizationId, saleId, type: "PURCHASE" } });
    if (existing) {
      if (existing.status === "SENT") return;
      try { await this.enqueue(existing.id); }
      catch { this.logger.warn("conversion_outbox_retry_pending"); }
      return;
    }
    await this.record({ organizationId, leadId: sale.leadId, saleId, type: "PURCHASE", valueCents: sale.amountCents, currency: sale.currency, occurredAt: sale.occurredAt ?? sale.detectedAt });
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
      await this.enqueue(event.id);
    }
  }

  private async record(input: RecordInput): Promise<void> {
    const connection = await this.prisma.metaConnection.findUnique({ where: { organizationId: input.organizationId } });
    if (!connection) return;

    const deduplicationKey = input.saleId ? `sale:${input.saleId}:PURCHASE` : `${input.leadId}:${input.type}`;
    let event;
    try {
      event = await this.prisma.conversionEvent.create({
        data: {
          organizationId: input.organizationId,
          deduplicationKey,
          saleId: input.saleId,
          leadId: input.leadId,
          type: input.type,
          valueCents: input.valueCents ?? null,
          currency: input.valueCents !== undefined ? input.currency ?? await this.currencyFor(input.organizationId) : null,
          occurredAt: input.occurredAt,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        event = await this.prisma.conversionEvent.findUnique({ where: { deduplicationKey } });
        if (!event || event.status === "SENT") return;
      } else throw error;
    }

    await this.enqueue(event.id);
  }

  private async currencyFor(organizationId: string): Promise<string> {
    const organization = await this.prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
    return organization.currency;
  }
}
