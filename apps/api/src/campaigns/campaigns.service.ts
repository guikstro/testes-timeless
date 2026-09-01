import { Injectable } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";
import { AdPlatform } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { CriarCampanhaManualDto, RegistrarGastoDto } from "./dto/manual-campaign.dto";

@Injectable()
export class CampaignsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(organizationId: string) {
    const campaigns = await this.prisma.campaign.findMany({
      where: { organizationId },
      include: {
        adSets: { include: { ads: true } },
        spend: { orderBy: { date: "desc" }, take: 30 },
      },
      orderBy: { lastSyncedAt: "desc" },
    });

    return campaigns.map((campaign) => ({
      ...campaign,
      totalSpendCents: campaign.spend.reduce((sum, row) => sum + row.spendCents, 0),
    }));
  }

  /**
   * Cria uma campanha lançada à mão.
   *
   * O id externo é opcional e, quando ausente, geramos um interno com prefixo
   * `manual:`. Isso mantém a coluna única sem obrigar quem só quer registrar
   * gasto a caçar o id na plataforma. Quando a sincronização automática chegar,
   * ela encontra a linha pelo id real e assume; a linha sem id fica como
   * registro manual, que é o que ela é.
   */
  async criarManual(organizationId: string, dto: CriarCampanhaManualDto) {
    const externalId = dto.externalId?.trim() || `manual:${organizationId}:${Date.now()}`;

    const existente = await this.prisma.campaign.findUnique({ where: { externalId } });
    if (existente) {
      throw new AppException(
        "CAMPAIGN_EXISTS",
        "Já existe uma campanha com esse id nesta plataforma.",
        HttpStatus.CONFLICT,
      );
    }

    return this.prisma.campaign.create({
      data: {
        organizationId,
        externalId,
        name: dto.name.trim(),
        platform: dto.platform,
        status: "ACTIVE",
        manual: true,
        lastSyncedAt: new Date(),
      },
    });
  }

  /**
   * Lança o gasto de um dia.
   *
   * Sobrescreve o valor daquele dia em vez de somar: lançar duas vezes o mesmo
   * dia é correção, não acúmulo, e somar transformaria um erro de digitação em
   * dado permanentemente errado.
   */
  async registrarGasto(organizationId: string, campaignId: string, dto: RegistrarGastoDto) {
    const campanha = await this.prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
    if (!campanha) {
      throw new AppException("NOT_FOUND", "Campanha não encontrada.", HttpStatus.NOT_FOUND);
    }

    const date = new Date(`${dto.date}T00:00:00.000Z`);

    return this.prisma.adSpend.upsert({
      where: { campaignId_date: { campaignId, date } },
      create: { campaignId, date, spendCents: dto.spendCents },
      update: { spendCents: dto.spendCents },
    });
  }

  async removerManual(organizationId: string, campaignId: string) {
    const campanha = await this.prisma.campaign.findFirst({
      where: { id: campaignId, organizationId, manual: true },
    });
    if (!campanha) {
      // Só campanhas manuais podem ser removidas: uma vinda da sincronização
      // voltaria na próxima execução, e apagá-la seria um botão que não cumpre.
      throw new AppException(
        "NOT_FOUND",
        "Campanha não encontrada, ou veio de sincronização automática.",
        HttpStatus.NOT_FOUND,
      );
    }

    await this.prisma.campaign.delete({ where: { id: campaignId } });
  }

  listarPorPlataforma(organizationId: string, platform: AdPlatform) {
    return this.prisma.campaign.findMany({
      where: { organizationId, platform },
      include: { spend: { orderBy: { date: "desc" }, take: 90 } },
      orderBy: { name: "asc" },
    });
  }
}
