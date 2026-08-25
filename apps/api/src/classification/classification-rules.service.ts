import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { CreateClassificationRuleDto } from "./dto/create-classification-rule.dto";

@Injectable()
export class ClassificationRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list(organizationId: string) {
    return this.prisma.classificationRule.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  create(organizationId: string, dto: CreateClassificationRuleDto) {
    return this.prisma.classificationRule.create({
      data: { organizationId, targetStatus: dto.targetStatus, phrase: dto.phrase.trim() },
    });
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const rule = await this.prisma.classificationRule.findFirst({ where: { id, organizationId } });
    if (!rule) {
      throw new AppException("NOT_FOUND", "Regra não encontrada.", HttpStatus.NOT_FOUND);
    }
    await this.prisma.classificationRule.delete({ where: { id } });
  }
}
