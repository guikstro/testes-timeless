import { Injectable } from "@nestjs/common";
import { HttpStatus } from "@nestjs/common";
import { AdPlatform } from "@prisma/client";
import { PrismaService } from "../common/prisma/prisma.service";
import { AppException } from "../common/exceptions/app-exception";
import { hojeLocal } from "../common/tempo";
import { CriarCampanhaManualDto, RegistrarGastoDto } from "./dto/manual-campaign.dto";
import { extraiGastos, leCsv } from "./csv-gasto";

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
  /**
   * Gasto por campanha dentro de uma janela de dias.
   *
   * Existe separado de `list()` porque aquela rota traz só as trinta linhas de
   * gasto mais recentes, o que bastaria para uma tela de acompanhamento mas
   * truncaria o investimento de um relatório de noventa dias, e um custo por
   * lead calculado sobre gasto truncado sai baixo demais.
   */
  async investimentoNoPeriodo(organizationId: string, dias: number) {
    // As datas de gasto são gravadas na meia-noite UTC do dia civil, então a
    // janela é montada no mesmo formato. O dia de hoje, porém, é o dia de
    // Brasília: perto da meia-noite o UTC já virou, e a janela pularia um dia
    // à frente do que o cliente vê no relógio dele.
    const ate = new Date(`${hojeLocal()}T00:00:00.000Z`);
    const de = new Date(ate);
    de.setUTCDate(de.getUTCDate() - (dias - 1));

    const campanhas = await this.prisma.campaign.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        platform: true,
        spend: {
          where: { date: { gte: de, lte: ate } },
          select: { spendCents: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return campanhas.map((campanha) => ({
      id: campanha.id,
      name: campanha.name,
      platform: campanha.platform,
      // Dias com gasto registrado, não dias corridos: é o que diz se a
      // campanha rodou o período inteiro ou só parte dele.
      diasComGasto: campanha.spend.length,
      totalCents: campanha.spend.reduce((soma, linha) => soma + linha.spendCents, 0),
    }));
  }

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

  /**
   * Lê o arquivo e devolve o que encontrou, sem gravar nada.
   *
   * A importação acontece em duas etapas de propósito: nenhum relatório de
   * anúncio é padronizado, e escrever direto significaria descobrir a coluna
   * errada depois de o dado já estar no banco. A prévia deixa a pessoa
   * conferir antes.
   */
  previewCsv(conteudo: string) {
    const csv = leCsv(conteudo);

    if (csv.cabecalho.length === 0) {
      throw new AppException(
        "CSV_VAZIO",
        "Não encontrei colunas neste arquivo. Confira se é o relatório exportado da plataforma.",
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      cabecalho: csv.cabecalho,
      sugestaoData: csv.sugestaoData,
      sugestaoValor: csv.sugestaoValor,
      totalLinhas: csv.linhas.length,
      amostra: csv.linhas.slice(0, 5),
    };
  }

  async importarCsv(
    organizationId: string,
    campaignId: string,
    conteudo: string,
    colunaData: number,
    colunaValor: number,
  ) {
    const campanha = await this.prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
    if (!campanha) {
      throw new AppException("NOT_FOUND", "Campanha não encontrada.", HttpStatus.NOT_FOUND);
    }

    const { linhas, ignoradas } = extraiGastos(leCsv(conteudo), colunaData, colunaValor);

    if (linhas.length === 0) {
      throw new AppException(
        "NENHUMA_LINHA",
        "Nenhuma linha pôde ser lida com as colunas escolhidas. Confira quais colunas são a data e o valor.",
        HttpStatus.BAD_REQUEST,
      );
    }

    // Uma transação: importar metade de um relatório e falhar deixaria a
    // campanha com gasto parcial, que é pior que não importar.
    await this.prisma.$transaction(
      linhas.map((linha) =>
        this.prisma.adSpend.upsert({
          where: { campaignId_date: { campaignId, date: new Date(`${linha.date}T00:00:00.000Z`) } },
          create: { campaignId, date: new Date(`${linha.date}T00:00:00.000Z`), spendCents: linha.spendCents },
          update: { spendCents: linha.spendCents },
        }),
      ),
    );

    return {
      importados: linhas.length,
      // Nunca em silêncio: uma linha descartada sem aviso é gasto que não
      // entrou na conta e ninguém sabe.
      ignoradas: ignoradas.slice(0, 20),
      totalIgnoradas: ignoradas.length,
      periodo: { de: linhas[0].date, ate: linhas[linhas.length - 1].date },
      totalCentavos: linhas.reduce((soma, linha) => soma + linha.spendCents, 0),
    };
  }
}
