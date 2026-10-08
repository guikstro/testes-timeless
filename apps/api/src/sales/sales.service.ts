import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  Prisma,
  SaleConfirmationSource,
  SaleEvidenceType,
  SaleStatus,
} from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditoriaService, Autor } from "../auditoria/auditoria.service";
import { ConversionEventsService } from "../integrations/meta/conversion-events.service";
import { IdentityResolutionService } from "./identity-resolution";
import { resolveSale } from "./sale-resolution";
import { ManualSaleDto, ReviewSaleDto, SalesQueryDto } from "./sales.dto";

export interface EvidenceInput {
  organizationId: string;
  eventKey: string;
  saleId?: string;
  sourceId?: string;
  externalId?: string;
  leadId?: string;
  phone?: string;
  email?: string;
  customerExternalId?: string;
  unitCode?: string;
  source: SaleConfirmationSource;
  type: SaleEvidenceType;
  status: SaleStatus;
  valueCents?: number;
  currency: string;
  occurredAt: Date;
  confidence?: number;
  actorId?: string;
  impersonating?: boolean;
  customerName?: string;
  product?: string;
  notes?: string;
  lossReason?: string;
  payload?: Prisma.InputJsonObject;
}

function canonical(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
const json = (v: unknown) =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

@Injectable()
export class SalesService {
  private readonly identity = new IdentityResolutionService();
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditoriaService,
    private readonly conversions: ConversionEventsService,
  ) {}

  /** Serialize evidence/reviews per tenant. All writes and audit records commit together. */
  async record(input: EvidenceInput) {
    const fingerprint = createHash("sha256")
      .update(canonical(input))
      .digest("hex");
    const result = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${input.organizationId}, 0))`;
        return this.recordInTransaction(tx, input, fingerprint);
      },
      { timeout: 15000 },
    );
    await this.conversions.recordConfirmedSale(input.organizationId, result.id);
    return result;
  }

  private async recordInTransaction(
    tx: Prisma.TransactionClient,
    input: EvidenceInput,
    fingerprint: string,
  ) {
    const organizationId = input.organizationId;
    const duplicate = await tx.saleEvidence.findUnique({
      where: {
        organizationId_eventKey: { organizationId, eventKey: input.eventKey },
      },
    });
    if (duplicate) {
      if (duplicate.fingerprint !== fingerprint)
        throw new ConflictException(
          "Evento já recebido com outro conteúdo. Use um novo eventId para uma atualização.",
        );
      return tx.sale.findFirstOrThrow({
        where: { id: duplicate.saleId, organizationId },
      });
    }
    const organization = await tx.organization.findFirst({
      where: { id: organizationId, deletedAt: null },
    });
    if (!organization)
      throw new NotFoundException("Organização não encontrada.");
    let unitId: string | null = null;
    if (input.unitCode) {
      const unit = await tx.unit.findFirst({
        where: { organizationId, code: input.unitCode, active: true },
      });
      if (!unit)
        throw new BadRequestException(
          "Unidade não encontrada nesta organização.",
        );
      unitId = unit.id;
    }
    if (input.sourceId) {
      const source = await tx.salesSource.findFirst({
        where: { id: input.sourceId, organizationId, revokedAt: null },
      });
      if (!source)
        throw new BadRequestException("Fonte revogada ou indisponível.");
      if (source.unitId && unitId && source.unitId !== unitId)
        throw new BadRequestException(
          "Esta credencial pertence a outra unidade.",
        );
      unitId = source.unitId ?? unitId;
    }
    if (
      input.leadId &&
      !(await tx.lead.findFirst({
        where: { id: input.leadId, organizationId },
      }))
    )
      throw new NotFoundException("Lead não encontrado.");
    const identity = await this.identity.resolve(tx, organizationId, input);
    let sale = input.saleId
      ? await tx.sale.findFirst({
          where: { id: input.saleId, organizationId, deletedAt: null },
        })
      : null;
    if (input.saleId && !sale)
      throw new NotFoundException("Venda não encontrada.");
    if (input.sourceId && input.externalId) {
      const deal = await tx.externalDeal.findFirst({
        where: {
          organizationId,
          sourceId: input.sourceId,
          externalId: input.externalId,
        },
      });
      if (deal && sale && deal.saleId !== sale.id)
        throw new ConflictException(
          "Pedido externo já vinculado a outra venda.",
        );
      if (deal && !sale)
        sale = await tx.sale.findFirst({
          where: { id: deal.saleId, organizationId, deletedAt: null },
        });
    }
    if (!sale && input.sourceId && input.externalId)
      sale = await tx.sale.findFirst({
        where: {
          organizationId,
          sourceId: input.sourceId,
          externalId: input.externalId,
          deletedAt: null,
        },
      });
    if (!sale && identity.leadId) {
      const pending = await tx.sale.findMany({
        where: {
          organizationId,
          leadId: identity.leadId,
          unitId,
          deletedAt: null,
          status: { in: ["POSSIBLE", "PROBABLE"] },
          sourceId: null,
        },
        take: 2,
      });
      if (pending.length === 1) sale = pending[0];
    }
    if (sale?.unitId && unitId && sale.unitId !== unitId)
      throw new ConflictException("Venda vinculada a outra unidade.");
    if (sale?.leadId && identity.leadId && sale.leadId !== identity.leadId)
      throw new ConflictException(
        "A identidade recebida difere do cliente desta venda.",
      );
    const before = sale;
    const leadId = sale?.leadId ?? identity.leadId;
    const attribution = leadId
      ? await tx.attribution.findFirst({
          where: { organizationId, leadId },
          include: { trackingClick: true },
        })
      : null;
    if (!sale)
      sale = await tx.sale.create({
        data: {
          organizationId,
          leadId,
          unitId,
          sourceId: input.sourceId,
          externalId: input.externalId,
          classifierType: input.source === "CONVERSATION" ? "RULE" : "MANUAL",
          detectedAt: input.occurredAt,
          currency: input.currency,
          customerName: input.customerName,
          customerPhone: input.phone,
          product: input.product,
          notes: input.notes,
        },
      });
    await tx.saleEvidence.create({
      data: {
        organizationId,
        saleId: sale.id,
        eventKey: input.eventKey,
        fingerprint,
        type: input.type,
        source: input.source,
        sourceId: input.sourceId,
        actorId: input.actorId,
        status: input.status,
        confidence: input.confidence,
        valueCents: input.valueCents,
        currency: input.currency,
        occurredAt: input.occurredAt,
        payload: {
          ...input.payload,
          ...(identity.ambiguous
            ? { identityCandidates: identity.candidates }
            : {}),
          ...(input.notes ? { notes: input.notes } : {}),
        },
      },
    });
    const evidence = await tx.saleEvidence.findMany({
      where: { organizationId, saleId: sale.id },
      orderBy: { sequence: "asc" },
    });
    const resolution = resolveSale(evidence);
    const lastIdentityReview = evidence
      .map((e) =>
        Boolean(
          (e.payload as { identityResolved?: boolean } | null)
            ?.identityResolved,
        ),
      )
      .lastIndexOf(true);
    const identityPending = evidence
      .slice(lastIdentityReview + 1)
      .some(
        (e) =>
          (e.payload as { identityCandidates?: string[] } | null)
            ?.identityCandidates?.length,
      );
    const { winnerId, ...resolved } = resolution;
    const updated = await tx.sale.update({
      where: { id: sale.id },
      data: {
        ...resolved,
        conflicts: json(resolution.conflicts),
        leadId,
        unitId: sale.unitId ?? unitId,
        needsReview:
          resolution.needsReview ||
          identity.ambiguous ||
          Boolean(identityPending),
        ...(input.sourceId && !sale.sourceId
          ? { sourceId: input.sourceId, externalId: input.externalId }
          : {}),
        confirmedAt:
          resolution.status === "CONFIRMED"
            ? (sale.confirmedAt ?? new Date())
            : sale.confirmedAt,
        rejectedAt:
          resolution.status === "REJECTED" ? new Date() : sale.rejectedAt,
        cancelledAt:
          resolution.status === "CANCELLED" ? new Date() : sale.cancelledAt,
        lossReason: input.lossReason ?? sale.lossReason,
        ...(resolution.status === "CONFIRMED" &&
        !sale.attributionSnapshot &&
        attribution
          ? { attributionSnapshot: json(attribution) }
          : {}),
      },
    });
    await this.audit.registra(
      {
        organizationId,
        userId: input.actorId ?? null,
        impersonating: input.impersonating,
      },
      {
        acao: before ? "SALE_UPDATED" : "SALE_CREATED",
        entidade: "Sale",
        entidadeId: sale.id,
        antes: before
          ? {
              status: before.status,
              amountCents: before.amountCents,
              needsReview: before.needsReview,
            }
          : undefined,
        depois: {
          status: updated.status,
          amountCents: updated.amountCents,
          currency: updated.currency,
          source: updated.confirmationSource,
          eventKey: input.eventKey,
          winnerId,
          conflicts: resolution.conflicts,
          needsReview: updated.needsReview,
        },
      },
      tx,
    );
    await this.conversions.stageConfirmedSale(tx, updated);
    if (leadId && !before)
      await tx.leadEvent.create({
        data: {
          organizationId,
          leadId,
          type: "SALE_DETECTED",
          occurredAt: input.occurredAt,
          metadata: {
            saleId: sale.id,
            status: updated.status,
            source: input.source,
          },
        },
      });
    if (input.sourceId && input.externalId) {
      const dealData = {
        organizationId,
        saleId: sale.id,
        provider: input.source,
        status: input.status,
        valueCents: input.valueCents,
        currency: input.currency,
        lastSyncedAt: new Date(),
      };
      await tx.externalDeal.upsert({
        where: {
          sourceId_externalId: {
            sourceId: input.sourceId,
            externalId: input.externalId,
          },
        },
        create: {
          ...dealData,
          sourceId: input.sourceId,
          externalId: input.externalId,
        },
        update: dealData,
      });
    }
    if (
      input.sourceId &&
      input.customerExternalId &&
      leadId &&
      !identity.ambiguous
    ) {
      await tx.externalIdentity.upsert({
        where: {
          sourceId_externalId: {
            sourceId: input.sourceId,
            externalId: input.customerExternalId,
          },
        },
        create: {
          organizationId,
          sourceId: input.sourceId,
          externalId: input.customerExternalId,
          leadId,
        },
        update: {},
      });
    }
    return updated;
  }

  manual(autor: Autor, dto: ManualSaleDto) {
    if (!dto.phone && !dto.leadId && !dto.customerName)
      throw new BadRequestException("Informe cliente ou telefone.");
    return this.record({
      ...dto,
      organizationId: autor.organizationId,
      actorId: autor.userId ?? undefined,
      impersonating: autor.impersonating,
      eventKey: `manual:${dto.requestId}`,
      source: "MANUAL",
      type: "MANUAL_CONFIRMATION",
      status: "CONFIRMED",
      occurredAt: new Date(dto.occurredAt),
    });
  }

  async review(autor: Autor, id: string, dto: ReviewSaleDto) {
    // Request identity is hashed independently of generated server timestamps for safe retries.
    const fingerprint = createHash("sha256")
      .update(canonical({ id, dto, actor: autor.userId }))
      .digest("hex");
    const sale = await this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${autor.organizationId}, 0))`;
        const existing = await tx.sale.findFirst({
          where: { id, organizationId: autor.organizationId, deletedAt: null },
          include: { evidence: { orderBy: { sequence: "asc" } } },
        });
        if (!existing) throw new NotFoundException("Venda não encontrada.");
        const chosen =
          dto.action === "RESOLVE"
            ? existing.evidence.find((e) => e.id === dto.selectedEvidenceId)
            : null;
        if (dto.action === "RESOLVE" && (!chosen || !dto.notes?.trim()))
          throw new BadRequestException(
            "Escolha uma evidência e informe o motivo da resolução.",
          );
        if (
          dto.action === "CONFIRM" &&
          (dto.valueCents ?? existing.amountCents) === null
        )
          throw new BadRequestException("Informe o valor confirmado.");
        if (dto.action === "LINK") {
          if (
            !dto.leadId ||
            !(await tx.lead.findFirst({
              where: { id: dto.leadId, organizationId: autor.organizationId },
            }))
          )
            throw new BadRequestException("Lead inválido.");
          if (existing.leadId && existing.leadId !== dto.leadId)
            throw new ConflictException(
              "A venda já está atribuída a outro lead.",
            );
        }
        return this.recordInTransaction(
          tx,
          {
            organizationId: autor.organizationId,
            saleId: id,
            eventKey: `review:${dto.requestId}`,
            source: "MANUAL",
            type:
              dto.action === "REJECT"
                ? "MANUAL_REJECTION"
                : dto.action === "CANCEL"
                  ? "CANCELLATION"
                  : "MANUAL_CONFIRMATION",
            status:
              dto.action === "REJECT"
                ? "REJECTED"
                : dto.action === "CANCEL"
                  ? "CANCELLED"
                  : (chosen?.status ??
                    (dto.action === "LINK" ? existing.status : "CONFIRMED")),
            valueCents:
              chosen?.valueCents ??
              dto.valueCents ??
              existing.amountCents ??
              undefined,
            currency: chosen?.currency ?? dto.currency ?? existing.currency,
            occurredAt: new Date(),
            actorId: autor.userId ?? undefined,
            impersonating: autor.impersonating,
            notes: dto.notes,
            leadId: dto.action === "LINK" ? dto.leadId : undefined,
            payload: {
              saleOccurredAt: (
                existing.occurredAt ?? existing.detectedAt
              ).toISOString(),
              ...(chosen
                ? {
                    selectedEvidenceId: chosen.id,
                    reviewedEvidenceIds: existing.evidence.map((e) => e.id),
                  }
                : dto.action === "LINK"
                  ? { identityResolved: true }
                  : {}),
            },
          },
          fingerprint,
        );
      },
      { timeout: 15000 },
    );
    await this.conversions.recordConfirmedSale(autor.organizationId, sale.id);
    return sale;
  }

  async list(organizationId: string, query: SalesQueryDto) {
    const where: Prisma.SaleWhereInput = {
      organizationId,
      deletedAt: null,
      ...(query.status ? { status: query.status } : {}),
      ...(query.review ? { needsReview: true } : {}),
      ...(query.unitId ? { unitId: query.unitId } : {}),
      ...(query.from || query.to
        ? {
            occurredAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        include: {
          lead: { select: { id: true, name: true, normalizedPhone: true } },
          unit: true,
          source: { select: { name: true, type: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: query.offset ?? 0,
        take: query.limit ?? 20,
      }),
      this.prisma.sale.count({ where }),
    ]);
    return {
      items,
      total,
      offset: query.offset ?? 0,
      limit: query.limit ?? 20,
    };
  }

  async detail(organizationId: string, id: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: {
        evidence: { orderBy: { sequence: "asc" } },
        lead: {
          select: {
            id: true,
            name: true,
            normalizedPhone: true,
            attribution: true,
          },
        },
        unit: true,
        source: { select: { name: true, type: true } },
        conversionEvents: {
          select: {
            type: true,
            status: true,
            valueCents: true,
            currency: true,
            sentAt: true,
            lastError: true,
          },
        },
      },
    });
    if (!sale) throw new NotFoundException("Venda não encontrada.");
    const people = await this.prisma.user.findMany({
      where: {
        id: {
          in: sale.evidence.flatMap((e) => (e.actorId ? [e.actorId] : [])),
        },
        memberships: { some: { organizationId } },
      },
      select: { id: true, name: true },
    });
    const candidateIds = sale.evidence.flatMap(
      (e) =>
        (e.payload as { identityCandidates?: string[] } | null)
          ?.identityCandidates ?? [],
    );
    const identityCandidates = await this.prisma.lead.findMany({
      where: { organizationId, id: { in: candidateIds } },
      select: { id: true, name: true, normalizedPhone: true },
      take: 20,
    });
    return {
      ...sale,
      identityCandidates,
      evidence: sale.evidence.map((e) => ({
        ...e,
        actorName: people.find((p) => p.id === e.actorId)?.name ?? null,
      })),
    };
  }

  async analytics(organizationId: string, query: SalesQueryDto) {
    const occurredAt = {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lte: new Date(query.to) } : {}),
    };
    const where = {
      organizationId,
      deletedAt: null,
      ...(query.unitId ? { unitId: query.unitId } : {}),
      occurredAt,
    };
    const [revenue, possible, review, cancelled] = await Promise.all([
      this.prisma.sale.groupBy({
        by: ["currency"],
        where: { ...where, status: "CONFIRMED", needsReview: false },
        _sum: { amountCents: true },
        _count: { _all: true, amountCents: true },
      }),
      this.prisma.sale.count({
        where: { ...where, status: { in: ["POSSIBLE", "PROBABLE"] } },
      }),
      this.prisma.sale.count({ where: { ...where, needsReview: true } }),
      this.prisma.sale.count({ where: { ...where, status: "CANCELLED" } }),
    ]);
    return {
      currencies: revenue.map((r) => ({
        currency: r.currency,
        confirmedSales: r._count._all,
        revenueCents: r._sum.amountCents ?? 0,
        unknownValues: r._count._all - r._count.amountCents,
        averageTicketCents: r._count.amountCents
          ? Math.round((r._sum.amountCents ?? 0) / r._count.amountCents)
          : null,
      })),
      possibleSales: possible,
      requiresReview: review,
      cancelledSales: cancelled,
    };
  }
}
