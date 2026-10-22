import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { diaCivilLocal, fimDoDia, inicioDoDia } from "../../common/tempo";
import { LeadParaExportar, LinhaDeConversao, montaLinhas } from "./google-conversion-rows";

export interface ExportacaoDeConversoes {
  periodo: { de: string; ate: string };
  /** Nomes configurados na organização. Null enquanto ninguém os informou. */
  acoes: { qualificado: string | null; venda: string | null };
  linhas: LinhaDeConversao[];
  /**
   * Conversões do período que não têm gclid e por isso não voltam para o
   * Google. Vai junto porque a pergunta seguinte a "exportei 12" é sempre
   * "e as outras?", e sem este número a resposta parece perda de dado.
   */
  semGclid: { qualificados: number; vendas: number };
}

/** Uma conversão pronta para o script subir pelo Google Ads. */
export interface ConversaoParaOScript {
  /** Identifica a conversão na confirmação de envio. */
  chave: string;
  gclid: string;
  /** O nome da ação de conversão, igual ao cadastrado no Google Ads. */
  nome: string;
  /** `2026-09-01 14:32:10-03:00`: o mesmo formato do arquivo de importação. */
  horario: string;
  /** Em reais (não em micros); null quando a conversão não tem valor. */
  valor: number | null;
  moeda: string;
}

/** Quantos dias para trás o script olha a cada rodada. */
export const DIAS_DAS_CONVERSOES_DO_SCRIPT = 30;

export function chaveDaConversao(linha: Pick<LinhaDeConversao, "leadId" | "tipo" | "ocorridoEm">): string {
  return `${linha.leadId}:${linha.tipo}:${linha.ocorridoEm}`;
}

@Injectable()
export class GoogleConversionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(organizationId: string, periodo: { de: string; ate: string }): Promise<ExportacaoDeConversoes> {
    const de = inicioDoDia(periodo.de);
    const ate = fimDoDia(periodo.ate);

    const vendasNaJanela = { status: "CONFIRMED" as const, needsReview: false, deletedAt: null, occurredAt: { gte: de, lte: ate } };
    const naJanela = {
      organizationId,
      OR: [{ qualifiedAt: { gte: de, lte: ate } }, { sales: { some: vendasNaJanela } }],
    };

    // O gclid é o que liga a conversão ao clique pago do Google. Sem ele não
    // há o que devolver, e por isso a consulta parte dele.
    const comGclid = { attribution: { trackingClick: { gclid: { not: null } } } };

    const [organizacao, leads, qualificadosSemGclid, vendasSemGclid] = await Promise.all([
      this.prisma.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { timezone: true, googleConversionQualified: true, googleConversionWon: true },
      }),
      this.prisma.lead.findMany({
        where: { ...naJanela, ...comGclid },
        select: {
          id: true,
          name: true,
          qualifiedAt: true,
          wonAt: true,
          sales: { where: vendasNaJanela, select: { amountCents: true, occurredAt: true, detectedAt: true, currency: true }, orderBy: { occurredAt: "desc" } },
          attribution: { select: { trackingClick: { select: { gclid: true, clickedAt: true } } } },
        },
      }),
      this.prisma.lead.count({
        where: { organizationId, qualifiedAt: { gte: de, lte: ate }, NOT: comGclid },
      }),
      this.prisma.sale.count({
        where: { organizationId, ...vendasNaJanela, OR: [{ leadId: null }, { lead: { NOT: comGclid } }] },
      }),
    ]);

    const paraExportar: LeadParaExportar[] = leads
      // O filtro da consulta já garante o gclid; este `flatMap` existe para o
      // tipo, que não sabe disso, e não para a regra.
      .flatMap((lead) => {
        const clique = lead.attribution?.trackingClick;
        if (!clique?.gclid) return [];
        return [
          {
            id: lead.id,
            name: lead.name,
            qualifiedAt: lead.qualifiedAt,
            wonAt: null,
            sale: null,
            sales: lead.sales,
            gclid: clique.gclid,
            clickedAt: clique.clickedAt,
          },
        ];
      });

    return {
      periodo,
      acoes: {
        qualificado: organizacao.googleConversionQualified,
        venda: organizacao.googleConversionWon,
      },
      linhas: montaLinhas(paraExportar, de, ate, organizacao.timezone),
      semGclid: { qualificados: qualificadosSemGclid, vendas: vendasSemGclid },
    };
  }

  /**
   * O que o script ainda não subiu: os últimos 30 dias, só linhas com ação de
   * conversão configurada e clique dentro da janela de 90 dias do Google, e
   * nada que já tenha sido confirmado como enviado.
   */
  async pendentesParaOScript(organizationId: string, agora = new Date()): Promise<ConversaoParaOScript[]> {
    const ate = diaCivilLocal(agora);
    const de = diaCivilLocal(new Date(agora.getTime() - (DIAS_DAS_CONVERSOES_DO_SCRIPT - 1) * 86_400_000));
    const exportacao = await this.listar(organizationId, { de, ate });
    const moedaPadrao =
      (await this.prisma.organization.findUnique({ where: { id: organizationId }, select: { currency: true } }))?.currency ??
      "BRL";

    const candidatas = exportacao.linhas.flatMap((linha) => {
      const nome = linha.tipo === "QUALIFIED" ? exportacao.acoes.qualificado : exportacao.acoes.venda;
      if (!nome || linha.foraDaJanela) return [];
      return [
        {
          chave: chaveDaConversao(linha),
          gclid: linha.gclid,
          nome,
          horario: linha.conversionTime,
          valor: linha.valorCentavos === null ? null : linha.valorCentavos / 100,
          moeda: linha.currency ?? moedaPadrao,
        },
      ];
    });
    if (candidatas.length === 0) return [];

    const enviadas = await this.prisma.googleConversaoEnviada.findMany({
      where: { organizationId, chave: { in: candidatas.map((c) => c.chave) } },
      select: { chave: true },
    });
    const jaFoi = new Set(enviadas.map((e) => e.chave));
    return candidatas.filter((c) => !jaFoi.has(c.chave));
  }

  /** O script confirma o que subiu. Repetir a confirmação não duplica nada. */
  async confirmaEnvio(organizationId: string, chaves: string[]): Promise<number> {
    if (chaves.length === 0) return 0;
    const { count } = await this.prisma.googleConversaoEnviada.createMany({
      data: chaves.map((chave) => ({ organizationId, chave })),
      skipDuplicates: true,
    });
    return count;
  }
}
