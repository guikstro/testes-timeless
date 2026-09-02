import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { fimDoDia, inicioDoDia } from "../../common/tempo";
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

@Injectable()
export class GoogleConversionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listar(organizationId: string, periodo: { de: string; ate: string }): Promise<ExportacaoDeConversoes> {
    const de = inicioDoDia(periodo.de);
    const ate = fimDoDia(periodo.ate);

    const naJanela = {
      organizationId,
      OR: [{ qualifiedAt: { gte: de, lte: ate } }, { wonAt: { gte: de, lte: ate } }],
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
          sale: { select: { amountCents: true, detectedAt: true } },
          attribution: { select: { trackingClick: { select: { gclid: true, clickedAt: true } } } },
        },
      }),
      this.prisma.lead.count({
        where: { organizationId, qualifiedAt: { gte: de, lte: ate }, NOT: comGclid },
      }),
      this.prisma.lead.count({
        where: { organizationId, wonAt: { gte: de, lte: ate }, NOT: comGclid },
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
            wonAt: lead.wonAt,
            sale: lead.sale,
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
}
