import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, randomBytes } from "node:crypto";
import { SaleEvidenceType, SalesSource } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { AuditoriaService, Autor } from "../auditoria/auditoria.service";
import { SalesService } from "./sales.service";
import { CreateSourceDto, CreateUnitDto, SalesEventDto } from "./sales.dto";

const publicFields = {
  id: true,
  name: true,
  type: true,
  unitId: true,
  credentialPrefix: true,
  revokedAt: true,
  lastEventAt: true,
  lastSuccessAt: true,
  lastError: true,
  createdAt: true,
} as const;
export const credentialHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");

@Injectable()
export class SalesSourcesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditoriaService,
    private readonly sales: SalesService,
  ) {}

  list(organizationId: string) {
    return this.prisma.salesSource.findMany({
      where: { organizationId },
      select: publicFields,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
  }
  units(organizationId: string) {
    return this.prisma.unit.findMany({
      where: { organizationId, active: true },
      orderBy: { name: "asc" },
      take: 1000,
    });
  }

  async createUnit(autor: Autor, dto: CreateUnitDto) {
    return this.prisma.$transaction(async (tx) => {
      const unit = await tx.unit.create({
        data: { organizationId: autor.organizationId, ...dto },
      });
      await this.audit.registra(
        autor,
        {
          acao: "CONNECTION_CHANGED",
          entidade: "Unit",
          entidadeId: unit.id,
          depois: dto,
        },
        tx,
      );
      return unit;
    });
  }

  async create(autor: Autor, dto: CreateSourceDto) {
    const token = `tls_${randomBytes(32).toString("hex")}`;
    const source = await this.prisma.$transaction(async (tx) => {
      let unitId: string | undefined;
      if (dto.unitCode) {
        const unit = await tx.unit.findFirst({
          where: {
            organizationId: autor.organizationId,
            code: dto.unitCode,
            active: true,
          },
        });
        if (!unit) throw new BadRequestException("Unidade não encontrada.");
        unitId = unit.id;
      }
      const created = await tx.salesSource.create({
        data: {
          organizationId: autor.organizationId,
          name: dto.name,
          type: dto.type,
          unitId,
          credentialHash: credentialHash(token),
          credentialPrefix: token.slice(0, 12),
        },
        select: publicFields,
      });
      await this.audit.registra(
        autor,
        {
          acao: "CONNECTION_CHANGED",
          entidade: "SalesSource",
          entidadeId: created.id,
          depois: { name: dto.name, type: dto.type, action: "CREATE" },
        },
        tx,
      );
      return created;
    });
    return { ...source, token };
  }

  async credential(autor: Autor, id: string, revoke: boolean) {
    const token = revoke ? null : `tls_${randomBytes(32).toString("hex")}`;
    const source = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.salesSource.findFirst({
        where: { organizationId: autor.organizationId, id },
      });
      if (!existing) throw new NotFoundException("Fonte não encontrada.");
      const updated = await tx.salesSource.update({
        where: { id },
        data: {
          credentialHash: token ? credentialHash(token) : null,
          credentialPrefix: token?.slice(0, 12) ?? null,
          revokedAt: revoke ? new Date() : null,
        },
        select: publicFields,
      });
      await this.audit.registra(
        autor,
        {
          acao: "CONNECTION_CHANGED",
          entidade: "SalesSource",
          entidadeId: id,
          depois: { action: revoke ? "REVOKE" : "ROTATE" },
        },
        tx,
      );
      return updated;
    });
    return { ...source, ...(token ? { token } : {}) };
  }

  async authenticate(authorization?: string) {
    if (!authorization || !/^Bearer tls_[a-f0-9]{64}$/.test(authorization))
      throw new UnauthorizedException("Credencial de integração inválida.");
    const source = await this.prisma.salesSource.findFirst({
      where: {
        credentialHash: credentialHash(authorization.slice(7)),
        revokedAt: null,
        organization: { deletedAt: null },
      },
    });
    if (!source)
      throw new UnauthorizedException("Credencial de integração inválida.");
    return source;
  }

  async event(source: SalesSource, dto: SalesEventDto) {
    await this.prisma.salesSource.update({
      where: { id: source.id },
      data: { lastEventAt: new Date() },
    });
    const confirmedTypes: Partial<Record<string, SaleEvidenceType>> = {
      CRM: "CRM_WON",
      PAYMENT: "PAYMENT_CONFIRMED",
      ERP: "ERP_ORDER",
      ECOMMERCE: "ECOMMERCE_ORDER",
    };
    try {
      const sale = await this.sales.record({
        ...dto,
        organizationId: source.organizationId,
        sourceId: source.id,
        source: source.type,
        eventKey: `source:${source.id}:${dto.eventId ?? `${dto.externalId}:${dto.status}`}`,
        type:
          dto.status === "WON"
            ? (confirmedTypes[source.type] ?? "EXTERNAL_API")
            : dto.status === "LOST"
              ? "CRM_LOST"
              : dto.status === "REFUNDED"
                ? "PAYMENT_REFUNDED"
                : "CANCELLATION",
        status:
          dto.status === "WON"
            ? "CONFIRMED"
            : dto.status === "LOST"
              ? "REJECTED"
              : "CANCELLED",
        occurredAt: new Date(dto.occurredAt),
        payload: JSON.parse(JSON.stringify(dto)),
      });
      await this.prisma.salesSource.update({
        where: { id: source.id },
        data: { lastSuccessAt: new Date(), lastError: null },
      });
      return {
        saleId: sale.id,
        status: sale.status,
        needsReview: sale.needsReview,
      };
    } catch (error) {
      await this.prisma.salesSource.update({
        where: { id: source.id },
        data: {
          lastError:
            error instanceof BadRequestException ||
            error instanceof NotFoundException
              ? error.message
              : "Evento recusado ou indisponível. Confira os dados e tente novamente com o mesmo eventId.",
        },
      });
      throw error;
    }
  }
}
