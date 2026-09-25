import { HttpStatus, Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { situacaoDaVerba, SituacaoDaVerba } from "./calculo-da-verba";
import { Autor, AuditoriaService } from "../auditoria/auditoria.service";
import { SalvarVerbaDto } from "./dto/salvar-verba.dto";

/**
 * A verba combinada com o cliente, e quanto dela já foi.
 *
 * O gasto vem da mesma tabela que alimenta o resto do produto, para não haver
 * dois números diferentes para a mesma pergunta. E as datas são comparadas
 * como dia civil, sem conversão de fuso: tanto a verba quanto o gasto diário
 * são dia de calendário gravado à meia-noite UTC, e converter um deles faria
 * o primeiro e o último dia do mês entrarem na conta errada.
 */
@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditoria: AuditoriaService,
  ) {}

  /** Todas as verbas, da mais recente para a mais antiga. */
  listar(organizationId: string) {
    return this.prisma.budget.findMany({
      where: { organizationId },
      orderBy: { startsOn: "desc" },
      take: 50,
    });
  }

  /**
   * A verba que vale hoje.
   *
   * A que já começou e ainda não terminou. Havendo mais de uma candidata,
   * vence a que começou por último: é o jeito de um aporte novo substituir o
   * anterior sem exigir que alguém volte para encerrar o antigo à mão.
   */
  private async vigente(organizationId: string, hoje: Date) {
    return this.prisma.budget.findFirst({
      where: {
        organizationId,
        startsOn: { lte: hoje },
        OR: [{ endsOn: null }, { endsOn: { gte: hoje } }],
      },
      orderBy: { startsOn: "desc" },
    });
  }

  /**
   * Situação da verba de hoje.
   *
   * Devolve `null` quando não há verba declarada, e a tela precisa tratar isso
   * como convite a declarar uma — não como zero. Verba não declarada e verba
   * zerada são coisas diferentes.
   */
  async resumo(organizationId: string, agora = new Date()): Promise<SituacaoDaVerba | null> {
    const hoje = new Date(`${agora.toISOString().slice(0, 10)}T00:00:00.000Z`);
    const verba = await this.vigente(organizationId, hoje);
    if (!verba) return null;

    const ate = verba.endsOn && verba.endsOn < hoje ? verba.endsOn : hoje;

    const gasto = await this.prisma.adSpend.aggregate({
      where: {
        campaign: { organizationId },
        date: { gte: verba.startsOn, lte: ate },
      },
      _sum: { spendCents: true },
    });

    return situacaoDaVerba(verba, gasto._sum.spendCents ?? 0, agora);
  }

  async criar(autor: Autor, dto: SalvarVerbaDto) {
    this.conferePeriodo(dto);
    const verba = await this.prisma.budget.create({
      data: {
        organizationId: autor.organizationId,
        startsOn: new Date(`${dto.de}T00:00:00.000Z`),
        endsOn: dto.ate ? new Date(`${dto.ate}T00:00:00.000Z`) : null,
        amountCents: dto.valorCentavos,
        label: dto.rotulo?.trim() || null,
      },
    });
    await this.auditoria.registra(autor, {
      acao: "BUDGET_CREATED",
      entidade: "Budget",
      entidadeId: verba.id,
      depois: resumoDaVerba(verba),
    });
    return verba;
  }

  async atualizar(autor: Autor, id: string, dto: SalvarVerbaDto) {
    this.conferePeriodo(dto);
    const antes = await this.suaOuErro(autor.organizationId, id);

    const depois = await this.prisma.budget.update({
      where: { id },
      data: {
        startsOn: new Date(`${dto.de}T00:00:00.000Z`),
        endsOn: dto.ate ? new Date(`${dto.ate}T00:00:00.000Z`) : null,
        amountCents: dto.valorCentavos,
        label: dto.rotulo?.trim() || null,
      },
    });
    await this.auditoria.registra(autor, {
      acao: "BUDGET_UPDATED",
      entidade: "Budget",
      entidadeId: id,
      antes: resumoDaVerba(antes),
      depois: resumoDaVerba(depois),
    });
    return depois;
  }

  async remover(autor: Autor, id: string): Promise<void> {
    const verba = await this.suaOuErro(autor.organizationId, id);
    await this.prisma.budget.delete({ where: { id } });
    await this.auditoria.registra(autor, {
      acao: "BUDGET_DELETED",
      entidade: "Budget",
      entidadeId: id,
      antes: resumoDaVerba(verba),
    });
  }

  /** O `organizationId` no filtro é o que impede mexer na verba de outro cliente. */
  private async suaOuErro(organizationId: string, id: string) {
    const verba = await this.prisma.budget.findFirst({ where: { id, organizationId } });
    if (!verba) {
      throw new AppException("NOT_FOUND", "Verba não encontrada.", HttpStatus.NOT_FOUND);
    }
    return verba;
  }

  private conferePeriodo(dto: SalvarVerbaDto): void {
    // Uma janela invertida faria a verba parecer consumida por gasto que
    // aconteceu fora dela, sem erro visível em lugar nenhum.
    if (dto.ate && dto.ate < dto.de) {
      throw new AppException(
        "PERIODO_INVALIDO",
        "A data final precisa ser igual ou depois da inicial.",
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}

/** A verba como a auditoria mostra: período, valor e nome, sem ids internos. */
function resumoDaVerba(verba: { startsOn: Date; endsOn: Date | null; amountCents: number; label: string | null }) {
  return {
    de: verba.startsOn.toISOString().slice(0, 10),
    ate: verba.endsOn ? verba.endsOn.toISOString().slice(0, 10) : null,
    valorCentavos: verba.amountCents,
    rotulo: verba.label,
  };
}
