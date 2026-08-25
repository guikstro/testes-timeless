import { HttpStatus, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { generateTrackingCode } from "../common/utils/generate-code";
import { PaginatedResult, PaginationQueryDto } from "../common/dto/pagination.dto";
import { CreateTrackingLinkDto } from "./dto/create-tracking-link.dto";
import { UpdateTrackingLinkDto } from "./dto/update-tracking-link.dto";

const CODE_GENERATION_MAX_ATTEMPTS = 5;

@Injectable()
export class TrackingLinksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(organizationId: string, dto: CreateTrackingLinkDto) {
    // Collisions are practically impossible (7 chars, 58-char alphabet ≈ 1.6e12
    // combinations) but we still guard against them rather than trust luck.
    for (let attempt = 0; attempt < CODE_GENERATION_MAX_ATTEMPTS; attempt++) {
      const code = generateTrackingCode();
      const existing = await this.prisma.trackingLink.findUnique({ where: { code } });
      if (existing) continue;

      return this.prisma.trackingLink.create({
        data: { organizationId, code, ...dto },
      });
    }

    throw new AppException(
      "CODE_GENERATION_FAILED",
      "Não foi possível gerar um código único para o link. Tente novamente.",
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }

  async list(
    organizationId: string,
    pagination: PaginationQueryDto,
  ): Promise<PaginatedResult<Prisma.TrackingLinkGetPayload<{ include: { _count: { select: { clicks: true } } } }>>> {
    const offset = pagination.offset ?? 0;
    const limit = pagination.limit ?? 20;

    const [items, total] = await Promise.all([
      this.prisma.trackingLink.findMany({
        where: { organizationId, deletedAt: null },
        include: { _count: { select: { clicks: true } } },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      this.prisma.trackingLink.count({ where: { organizationId, deletedAt: null } }),
    ]);

    return { items, total, offset, limit };
  }

  async findOne(organizationId: string, id: string) {
    const link = await this.prisma.trackingLink.findFirst({
      where: { id, organizationId, deletedAt: null },
      include: { _count: { select: { clicks: true } } },
    });

    if (!link) {
      throw new AppException("NOT_FOUND", "Link não encontrado.", HttpStatus.NOT_FOUND);
    }

    return link;
  }

  async update(organizationId: string, id: string, dto: UpdateTrackingLinkDto) {
    await this.findOne(organizationId, id);
    return this.prisma.trackingLink.update({ where: { id }, data: dto });
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.findOne(organizationId, id);
    // Soft delete: click history is a historical record and must not be
    // orphaned/destroyed just because the link itself was retired.
    await this.prisma.trackingLink.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
