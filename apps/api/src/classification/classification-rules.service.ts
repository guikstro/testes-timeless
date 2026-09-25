import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { Autor, AuditoriaService } from "../auditoria/auditoria.service";
import { CreateClassificationRuleDto } from "./dto/create-classification-rule.dto";

@Injectable()
export class ClassificationRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  list(organizationId: string) {
    return this.prisma.classificationRule.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
    });
  }

  /*
    Auditadas porque uma frase-gatilho decide sozinha que um lead virou venda:
    criar ou apagar uma muda os números de venda de todo o período seguinte,
    e "desde quando conta assim?" precisa ter resposta.
  */
  async create(autor: Autor, dto: CreateClassificationRuleDto) {
    const regra = await this.prisma.classificationRule.create({
      data: { organizationId: autor.organizationId, targetStatus: dto.targetStatus, phrase: dto.phrase.trim() },
    });
    await this.auditoria.registra(autor, {
      acao: "CLASSIFICATION_RULE_CREATED",
      entidade: "ClassificationRule",
      entidadeId: regra.id,
      depois: { frase: regra.phrase, marca: regra.targetStatus },
    });
    return regra;
  }

  async remove(autor: Autor, id: string): Promise<void> {
    const rule = await this.prisma.classificationRule.findFirst({ where: { id, organizationId: autor.organizationId } });
    if (!rule) {
      throw new AppException("NOT_FOUND", "Regra não encontrada.", HttpStatus.NOT_FOUND);
    }
    await this.prisma.classificationRule.delete({ where: { id } });
    await this.auditoria.registra(autor, {
      acao: "CLASSIFICATION_RULE_DELETED",
      entidade: "ClassificationRule",
      entidadeId: id,
      antes: { frase: rule.phrase, marca: rule.targetStatus },
    });
  }
}
