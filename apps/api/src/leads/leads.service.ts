import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { PaginatedResult, PaginationQueryDto } from "../common/dto/pagination.dto";

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string, pagination: PaginationQueryDto): Promise<PaginatedResult<unknown>> {
    const offset = pagination.offset ?? 0;
    const limit = pagination.limit ?? 20;

    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({
        where: { organizationId },
        orderBy: { lastContactAt: "desc" },
        skip: offset,
        take: limit,
      }),
      this.prisma.lead.count({ where: { organizationId } }),
    ]);

    return { items, total, offset, limit };
  }

  async findOne(organizationId: string, id: string) {
    const lead = await this.prisma.lead.findFirst({ where: { id, organizationId } });
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
}
