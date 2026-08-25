import { HttpStatus, Injectable } from "@nestjs/common";
import { LeadStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { PaginatedResult, PaginationQueryDto } from "../common/dto/pagination.dto";
import { ConversionEventsService } from "../integrations/meta/conversion-events.service";
import { UpdateLeadDto } from "./dto/update-lead.dto";

const STATUS_ORDER: Record<LeadStatus, number> = { NEW: 0, QUALIFIED: 1, WON: 2 };

@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversionEvents: ConversionEventsService,
  ) {}

  async list(organizationId: string, pagination: PaginationQueryDto): Promise<PaginatedResult<unknown>> {
    const offset = pagination.offset ?? 0;
    const limit = pagination.limit ?? 20;

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where: { organizationId },
        include: { attribution: true, sale: true },
        orderBy: { lastContactAt: "desc" },
        skip: offset,
        take: limit,
      }),
      this.prisma.lead.count({ where: { organizationId } }),
    ]);

    return { items, total, offset, limit };
  }

  async findOne(organizationId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({
      where: { id, organizationId },
      include: {
        attribution: { include: { trackingClick: { include: { trackingLink: true } } } },
        sale: true,
      },
    });
    if (!lead) {
      throw new AppException("NOT_FOUND", "Lead não encontrado.", HttpStatus.NOT_FOUND);
    }

    const [events, messages] = await Promise.all([
      this.prisma.leadEvent.findMany({ where: { leadId: id }, orderBy: { occurredAt: "asc" } }),
      this.prisma.message.findMany({
        where: { conversation: { leadId: id } },
        orderBy: { timestamp: "asc" },
      }),
    ]);

    return { ...lead, events, messages };
  }

  /**
   * Manual correction (Section 64) — "não criar um CRM completo", só o
   * necessário para consertar um estágio/valor que o tracking automático
   * errou. Every change is audited (Section 65) and mirrored into the
   * lead's timeline so it's visible in the same place as automatic events.
   */
  async update(organizationId: string, id: string, userId: string, dto: UpdateLeadDto) {
    const lead = await this.prisma.lead.findFirst({ where: { id, organizationId }, include: { sale: true } });
    if (!lead) {
      throw new AppException("NOT_FOUND", "Lead não encontrado.", HttpStatus.NOT_FOUND);
    }

    if (dto.status) {
      this.assertForwardTransition(lead.status, dto.status);
    }
    if (dto.revenueCents !== undefined && dto.status !== "WON" && lead.status !== "WON") {
      throw new AppException(
        "NO_SALE",
        "Não é possível definir receita para um lead sem venda registrada.",
        HttpStatus.BAD_REQUEST,
      );
    }

    const now = new Date();
    const beforeStatus = lead.status;
    const data: Prisma.LeadUpdateInput = {};
    let becameQualified = false;
    let becameWon = false;

    if (dto.status === "QUALIFIED" && lead.status === "NEW") {
      data.status = "QUALIFIED";
      data.qualifiedAt = lead.qualifiedAt ?? now;
      becameQualified = true;
    }

    if (dto.status === "WON" && lead.status !== "WON") {
      data.status = "WON";
      data.wonAt = now;
      if (!lead.qualifiedAt) {
        data.qualifiedAt = now;
        becameQualified = true;
      }
      becameWon = true;
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.lead.update({ where: { id }, data });
    }

    if (becameQualified) {
      await this.prisma.leadEvent.create({
        data: {
          organizationId,
          leadId: id,
          type: "QUALIFIED",
          occurredAt: now,
          metadata: { classifierType: "MANUAL", userId },
        },
      });
      await this.conversionEvents.recordQualifiedLead(organizationId, id, now);
    }

    let sale = lead.sale;

    if (becameWon) {
      sale = await this.prisma.sale.create({
        data: {
          organizationId,
          leadId: id,
          amountCents: dto.revenueCents ?? null,
          classifierType: "MANUAL",
          detectedAt: now,
        },
      });
      await this.prisma.leadEvent.create({
        data: {
          organizationId,
          leadId: id,
          type: "SALE_DETECTED",
          occurredAt: now,
          metadata: { classifierType: "MANUAL", userId },
        },
      });
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          entity: "Sale",
          entityId: sale.id,
          action: "SALE_CREATED",
          after: { amountCents: sale.amountCents },
        },
      });
      // Only sent once a value is known (Section: never guess) — a WON
      // correction with no revenueCents waits for a later correction below.
      if (dto.revenueCents !== undefined) {
        await this.conversionEvents.recordPurchase(organizationId, id, now, dto.revenueCents);
      }
    } else if (dto.revenueCents !== undefined && sale) {
      const before = { amountCents: sale.amountCents };
      sale = await this.prisma.sale.update({ where: { id: sale.id }, data: { amountCents: dto.revenueCents } });
      await this.prisma.leadEvent.create({
        data: {
          organizationId,
          leadId: id,
          type: "REVENUE_DETECTED",
          occurredAt: now,
          metadata: { classifierType: "MANUAL", userId, amountCents: dto.revenueCents },
        },
      });
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          entity: "Sale",
          entityId: sale.id,
          action: "SALE_UPDATED",
          before,
          after: { amountCents: sale.amountCents },
        },
      });
      // If this is the first time a value became known, this actually sends
      // the Purchase; if the sale was already sent, ConversionEventsService's
      // dedup on (leadId, type) makes this a no-op — a corrected value is
      // never re-sent to Meta (Section: known limitation, docs/META_CAPI.md).
      await this.conversionEvents.recordPurchase(organizationId, id, now, dto.revenueCents);
    }

    if (data.status) {
      await this.prisma.auditLog.create({
        data: {
          organizationId,
          userId,
          entity: "Lead",
          entityId: id,
          action: "LEAD_STATUS_CHANGED",
          before: { status: beforeStatus },
          after: { status: data.status },
        },
      });
    }

    return this.findOne(organizationId, id);
  }

  private assertForwardTransition(current: LeadStatus, target: "QUALIFIED" | "WON"): void {
    if (STATUS_ORDER[target] <= STATUS_ORDER[current]) {
      throw new AppException(
        "INVALID_STATUS_TRANSITION",
        `Não é possível mudar o status de ${current} para ${target}.`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
