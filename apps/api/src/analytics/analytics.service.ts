import { Injectable } from "@nestjs/common";
import { PrismaService } from "../common/prisma/prisma.service";
import {
  agregaChegadas,
  aggregateByOrigin,
  aggregateDaily,
  aggregateTotals,
  AggregationLead,
  ComparacaoTotais,
  comparaTotais,
  CelulaDeChegada,
  DailyPoint,
  medianaPrimeiraResposta,
  OriginBucket,
  OverviewTotals,
} from "./overview-aggregation";
import { MetricsMessage, computeLeadMetrics } from "../leads/lead-metrics";
import { AtendimentoDoLead, atendimentoPorLead } from "./atendimento-por-lead";
import { expedienteDa, SELECAO_DE_EXPEDIENTE } from "../common/expediente-da-organizacao";
import { extractAdIds } from "../leads/ad-references";
import {
  agregaDesempenhoPorAnuncio,
  GastoDoAnuncio,
  LeadDoAnuncio,
} from "./desempenho-por-anuncio";
import { fimDoDia, inicioDoDia, diaCivilLocal, FUSO } from "../common/tempo";
import { gastoPorDia } from "./gasto-por-dia";
import { identificacaoDosLeads, LeadIdentificado, MetodoDeIdentificacao } from "./identificacao-dos-leads";
import { completaIdsDoAnuncio, HierarquiaDoAnuncio } from "./vinculo-do-anuncio";
import {
  agregaDesempenhoPorCampanha,
  CampanhaComparada,
  comparaDesempenho,
  DesempenhoPorCampanha,
  LeadAtribuido,
} from "./campaign-performance";

export interface Overview {
  period: { days: number; from: string; to: string };
  totals: OverviewTotals;
  /** Mesmos números do período imediatamente anterior, para a tela mostrar variação. */
  comparacao: ComparacaoTotais;
  byOrigin: OriginBucket[];
  daily: DailyPoint[];
  chegadas: CelulaDeChegada[];
  atendimento: {
    medianaPrimeiraRespostaSegundos: number | null;
    respondidos: number;
    semResposta: number;
    aguardando: number;
  };
  setup: { whatsappConnected: boolean; metaConnected: boolean; trackingLinkCount: number };
}


export interface Janela {
  /** Dia civil no formato YYYY-MM-DD, inclusive nas duas pontas. */
  de: string;
  ate: string;
}

export interface DesempenhoDeCampanhas {
  periodo: Janela;
  comparacao: Janela | null;
  campanhas: CampanhaComparada[];
  semCampanha: { atual: number; anterior: number };
  totais: { gastoCentavos: number; leads: number; vendas: number; receitaCentavos: number };
}

/**
 * As duas mensagens que o cálculo de primeira resposta realmente olha.
 *
 * Reconstruídas a partir das datas agregadas, em vez de reimplementar a
 * conta aqui: assim o tempo de resposta da tela e o da ficha do lead saem da
 * mesma função, incluindo a proteção contra intervalo negativo e o desconto
 * de expediente. Duas cópias da mesma regra envelheceriam separadas.
 */
function mensagensDoAtendimento(atendimento: AtendimentoDoLead | undefined): MetricsMessage[] {
  if (!atendimento) return [];
  const mensagens: MetricsMessage[] = [];
  if (atendimento.primeiroRecebido) {
    mensagens.push({ direction: "INBOUND", timestamp: atendimento.primeiroRecebido, outboundStatus: null });
  }
  if (atendimento.primeiraResposta) {
    mensagens.push({ direction: "OUTBOUND", timestamp: atendimento.primeiraResposta, outboundStatus: "SENT" });
  }
  return mensagens;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(organizationId: string, days: number): Promise<Overview> {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - (days - 1));
    from.setHours(0, 0, 0, 0);

    // Janela anterior de mesmo tamanho, colada na atual: é o que dá sentido a
    // "subiu 15%", em vez de um número solto sem referência.
    const anteriorAte = new Date(from.getTime() - 1);
    const anteriorDe = new Date(from);
    anteriorDe.setDate(anteriorDe.getDate() - days);

    const selecao = {
      status: true,
      firstContactAt: true,
      qualifiedAt: true,
      wonAt: true,
      meetingScheduledAt: true,
      disqualifiedAt: true,
      sale: { select: { amountCents: true } },
      attribution: {
        select: {
          method: true,
          trackingClick: { select: { utmSource: true, trackingLink: { select: { name: true } } } },
        },
      },
    } as const;

    const [leads, anteriores, whatsapp, meta, trackingLinkCount, organizacao] = await Promise.all([
      // Só as colunas que a agregação lê. Carregar o lead inteiro traria a
      // conversa junto e tornaria o custo da tela proporcional ao volume de
      // mensagens, não ao de leads.
      this.prisma.lead.findMany({
        where: { organizationId, firstContactAt: { gte: from, lte: to } },
        // O `id` entra para o atendimento ser buscado depois, agregado no
        // banco, em vez de vir junto como a conversa inteira.
        select: { ...selecao, id: true },
      }),
      this.prisma.lead.findMany({
        where: { organizationId, firstContactAt: { gte: anteriorDe, lte: anteriorAte } },
        select: selecao,
      }),
      this.prisma.whatsAppConnection.findUnique({
        where: { organizationId },
        select: { status: true },
      }),
      this.prisma.metaConnection.findUnique({
        where: { organizationId },
        select: { status: true },
      }),
      this.prisma.trackingLink.count({ where: { organizationId, deletedAt: null } }),
      this.prisma.organization.findUnique({ where: { id: organizationId }, select: SELECAO_DE_EXPEDIENTE }),
    ]);

    // A mediana da tela precisa da mesma conta da ficha do lead, ou os dois
    // lugares diriam números diferentes para a mesma espera.
    const expediente = expedienteDa(organizacao);

    // A venda é 1:1 com o lead, mas só conta aqui se não foi removida:
    // `sale` já vem null para vendas apagadas por causa do soft delete.
    const aggregationLeads = leads as unknown as AggregationLead[];
    const totals = aggregateTotals(aggregationLeads);

    /*
      As mensagens não vêm mais para cá.

      Esta tela usava toda mensagem de toda conversa de todo lead da janela
      para responder duas perguntas: quanto a equipe demorou para responder, e
      se a bola está com ela agora. Na base atual isso é treze vezes mais
      linha do que lead, e um único lead conversador domina a tela inteira.
      Agora o banco devolve três datas por lead, e a conta continua sendo
      feita pela mesma função da ficha do lead, com as duas mensagens que ela
      de fato olha. Assim o número da tela e o da ficha não podem divergir.
    */
    const atendimentoDosLeads = await atendimentoPorLead(this.prisma, leads.map((lead) => lead.id));

    const tempos = leads.map((lead) => {
      const atendimento = atendimentoDosLeads.get(lead.id);
      return computeLeadMetrics(lead, mensagensDoAtendimento(atendimento), null, expediente).firstResponseSeconds;
    });
    const respondidos = tempos.filter((t) => t !== null).length;

    const aguardando = leads.filter(
      (lead) => atendimentoDosLeads.get(lead.id)?.ultimoSentido === "INBOUND",
    ).length;

    return {
      period: { days, from: from.toISOString(), to: to.toISOString() },
      totals,
      comparacao: comparaTotais(totals, aggregateTotals(anteriores as unknown as AggregationLead[])),
      byOrigin: aggregateByOrigin(aggregationLeads),
      daily: aggregateDaily(aggregationLeads, from, to),
      chegadas: agregaChegadas(aggregationLeads),
      atendimento: {
        medianaPrimeiraRespostaSegundos: medianaPrimeiraResposta(tempos),
        respondidos,
        semResposta: leads.length - respondidos,
        aguardando,
      },
      // Sem isto a tela não consegue explicar *por que* a origem está vazia,
      // e um dashboard que mostra "origem desconhecida: 100%" sem dizer o que
      // fazer a respeito é só uma constatação inútil.
      setup: {
        whatsappConnected: whatsapp?.status === "CONNECTED",
        metaConnected: meta?.status === "CONNECTED",
        trackingLinkCount,
      },
    };
  }

  /**
   * De cada anúncio sincronizado, a que conjunto e campanha ele pertence.
   *
   * Uma consulta só para todos os leads da janela, em vez de uma por lead. O
   * escopo desce pela campanha porque `Ad` e `AdSet` não carregam
   * organização: filtrar aqui, dentro da consulta, é o que impede um id de
   * outra conta de resolver para o nome da campanha dela.
   */
  private async hierarquiaDosAnuncios(
    organizationId: string,
    externalIds: string[],
  ): Promise<Map<string, HierarquiaDoAnuncio>> {
    if (externalIds.length === 0) return new Map();

    const anuncios = await this.prisma.ad.findMany({
      where: { externalId: { in: externalIds }, adSet: { campaign: { organizationId } } },
      select: {
        externalId: true,
        adSet: { select: { externalId: true, campaign: { select: { externalId: true } } } },
      },
    });

    return new Map(
      anuncios.map((anuncio) => [
        anuncio.externalId,
        {
          campaignExternalId: anuncio.adSet.campaign.externalId,
          adSetExternalId: anuncio.adSet.externalId,
        },
      ]),
    );
  }

  /**
   * Desempenho por campanha em dois períodos escolhidos à mão.
   *
   * Períodos livres, e não uma janela de "últimos N dias", porque uma
   * organização roda campanhas diferentes em meses diferentes: nenhuma janela
   * contada a partir de hoje consegue isolar a campanha que rodou em março, e
   * comparar março com julho é a pergunta que se faz de verdade.
   */
  async desempenhoPorCampanha(
    organizationId: string,
    periodo: Janela,
    comparacao: Janela | null,
  ): Promise<DesempenhoDeCampanhas> {
    const [atual, anterior] = await Promise.all([
      this.desempenhoNaJanela(organizationId, periodo),
      comparacao
        ? this.desempenhoNaJanela(organizationId, comparacao)
        : Promise.resolve<DesempenhoPorCampanha>({ campanhas: [], semCampanha: 0 }),
    ]);

    const juncao = comparaDesempenho(atual, anterior);

    return {
      periodo,
      comparacao,
      campanhas: juncao.campanhas,
      semCampanha: juncao.semCampanha,
      totais: atual.campanhas.reduce(
        (soma, linha) => ({
          gastoCentavos: soma.gastoCentavos + linha.gastoCentavos,
          leads: soma.leads + linha.leads,
          vendas: soma.vendas + linha.vendas,
          receitaCentavos: soma.receitaCentavos + linha.receitaCentavos,
        }),
        { gastoCentavos: 0, leads: 0, vendas: 0, receitaCentavos: 0 },
      ),
    };
  }

  /**
   * Uma janela só, já cruzada.
   *
   * As duas pontas são montadas em fusos diferentes de propósito, e a
   * diferença não é descuido:
   *
   * - O lead é um instante, então a janela dele vai da meia-noite à meia-noite
   *   no horário de Brasília. Em UTC, um lead das 22h cairia no dia seguinte.
   * - O gasto é um dia civil sem hora, gravado na meia-noite UTC. A janela
   *   dele acompanha esse mesmo eixo, ou nenhuma linha casaria.
   */
  private async desempenhoNaJanela(organizationId: string, janela: Janela): Promise<DesempenhoPorCampanha> {
    const de = inicioDoDia(janela.de);
    const ate = fimDoDia(janela.ate);
    const deDia = new Date(`${janela.de}T00:00:00.000Z`);
    const ateDia = new Date(`${janela.ate}T00:00:00.000Z`);

    const [campanhas, leads] = await Promise.all([
      this.prisma.campaign.findMany({
        where: { organizationId },
        select: {
          id: true,
          externalId: true,
          name: true,
          platform: true,
          spend: { where: { date: { gte: deDia, lte: ateDia } }, select: { date: true, spendCents: true } },
        },
      }),
      this.prisma.lead.findMany({
        where: { organizationId, firstContactAt: { gte: de, lte: ate } },
        select: {
          qualifiedAt: true,
          wonAt: true,
          sale: { select: { amountCents: true } },
          attribution: {
            select: {
              evidence: true,
              trackingClick: { select: { campaignId: true, adsetId: true, adId: true } },
            },
          },
        },
      }),
    ]);

    /*
      Sobe do anúncio para a campanha antes de agregar.

      Sem isto, todo lead vindo de Click-to-WhatsApp entrava com campanha nula
      e sumia deste relatório, embora a ficha do próprio lead mostrasse o nome
      da campanha: a Meta manda só o id do anúncio no referral, e a hierarquia
      só estava sendo resolvida na tela do lead.
    */
    const idsBrutos = leads.map((lead) => extractAdIds(lead.attribution));
    const hierarquia = await this.hierarquiaDosAnuncios(
      organizationId,
      [...new Set(idsBrutos.map((ids) => ids.adId).filter((id): id is string => id !== null))],
    );

    const atribuidos: LeadAtribuido[] = leads.map((lead, i) => ({
      campaignExternalId: completaIdsDoAnuncio(idsBrutos[i], hierarquia).campaignId,
      qualifiedAt: lead.qualifiedAt,
      wonAt: lead.wonAt,
      sale: lead.sale,
    }));

    const comAtividade = new Set(atribuidos.map((lead) => lead.campaignExternalId));

    return agregaDesempenhoPorCampanha(
      // Campanha sem gasto e sem lead na janela fica de fora: listá-la diria
      // que ela rodou sem resultado, quando o caso é que ela não rodou.
      campanhas.filter((campanha) => campanha.spend.length > 0 || comAtividade.has(campanha.externalId)),
      atribuidos,
    );
  }

  /**
   * Desempenho por anúncio, numa janela.
   *
   * A consulta de leads é a mesma do desempenho por campanha, de propósito: o
   * clique guarda os três ids, então trocar o agrupamento não custa consulta
   * nenhuma e garante que os dois níveis contem a mesma história. Se um lead
   * aparece numa campanha aqui e não lá, é defeito, não arredondamento.
   */
  async desempenhoPorAnuncio(organizationId: string, janela: Janela) {
    const de = inicioDoDia(janela.de);
    const ate = fimDoDia(janela.ate);
    const deDia = new Date(`${janela.de}T00:00:00.000Z`);
    const ateDia = new Date(`${janela.ate}T00:00:00.000Z`);

    const [linhas, leads, conexao] = await Promise.all([
      this.prisma.adInsight.findMany({
        // O escopo desce pela campanha: anúncio e conjunto não carregam
        // organização, e filtrar aqui é o que impede alcançar a conta alheia.
        where: { date: { gte: deDia, lte: ateDia }, ad: { adSet: { campaign: { organizationId } } } },
        select: {
          date: true,
          spendCents: true,
          impressions: true,
          clicks: true,
          ad: {
            select: {
              id: true,
              externalId: true,
              name: true,
              status: true,
              adSet: { select: { campaign: { select: { name: true } } } },
            },
          },
        },
      }),
      this.prisma.lead.findMany({
        where: { organizationId, firstContactAt: { gte: de, lte: ate } },
        select: {
          qualifiedAt: true,
          wonAt: true,
          sale: { select: { amountCents: true } },
          attribution: {
            select: {
              // O método entra aqui para a tela poder dizer *como* cada lead
              // foi identificado. Sem ele, "sem anúncio" vira uma categoria só
              // e some a diferença entre não ter evidência e ter evidência que
              // não chega ao nível do criativo.
              method: true,
              evidence: true,
              trackingClick: { select: { campaignId: true, adsetId: true, adId: true } },
            },
          },
        },
      }),
      /*
        De quando é o número, e se a fonte dele está de pé.

        Sem isto a tela mostra um gasto sem dizer de quando ele é, e a
        sincronia roda de hora em hora e pode estar quebrada: o painel
        continuaria exibindo o valor velho com cara de atual. Um filtro ou uma
        procedência não declarada é a causa mais comum de discussão numa
        reunião com o cliente.
      */
      this.prisma.metaConnection.findUnique({
        where: { organizationId },
        select: { status: true, lastSyncedAt: true, lastSyncError: true },
      }),
    ]);

    // As linhas vêm por dia; a tela quer o período. A soma acontece aqui e
    // não no banco porque o nome do anúncio e da campanha vêm na mesma
    // viagem, e agrupar no SQL exigiria repeti-los em cada linha.
    const porAnuncio = new Map<string, GastoDoAnuncio>();
    for (const linha of linhas) {
      const chave = linha.ad.externalId;
      const atual = porAnuncio.get(chave);
      if (atual) {
        atual.spendCents += linha.spendCents;
        atual.impressions += linha.impressions;
        atual.clicks += linha.clicks;
        continue;
      }
      porAnuncio.set(chave, {
        adId: linha.ad.id,
        externalId: linha.ad.externalId,
        name: linha.ad.name,
        status: linha.ad.status,
        campanha: linha.ad.adSet.campaign.name,
        spendCents: linha.spendCents,
        impressions: linha.impressions,
        clicks: linha.clicks,
      });
    }

    const atribuidos: LeadDoAnuncio[] = leads.map((lead) => ({
      adExternalId: extractAdIds(lead.attribution).adId,
      qualifiedAt: lead.qualifiedAt,
      wonAt: lead.wonAt,
      sale: lead.sale,
    }));

    /*
      Quantos leads a tabela acima consegue de fato mostrar.

      Sem esta conta a tela engana de um jeito específico: o lead que não pôde
      ser ligado a um anúncio não aparece em linha nenhuma, e o cliente lê
      "estes anúncios trouxeram doze leads" quando a verdade é "doze dos
      quarenta puderam ser ligados a um anúncio".

      `anuncioConhecido` compara contra os anúncios que gastaram na janela,
      que é exatamente o conjunto de linhas desenhadas na tabela.
    */
    const identificados: LeadIdentificado[] = leads.map((lead) => {
      const adExternalId = extractAdIds(lead.attribution).adId;
      return {
        metodo: (lead.attribution?.method as MetodoDeIdentificacao | undefined) ?? null,
        adExternalId,
        anuncioConhecido: adExternalId !== null && porAnuncio.has(adExternalId),
      };
    });

    return {
      periodo: janela,
      ...agregaDesempenhoPorAnuncio([...porAnuncio.values()], atribuidos),
      identificacao: identificacaoDosLeads(identificados),
      /*
        O extrato dia a dia, montado das mesmas linhas já carregadas acima:
        `adInsight` vem por anúncio e por dia, e a soma por dia não custa outra
        viagem ao banco.

        O "hoje" é o dia de Brasília, porque é o dia do cliente que olha a
        tela. As datas de gasto, essas, são dia civil em UTC e não podem passar
        por conversão nenhuma.
      */
      porDia: gastoPorDia(
        linhas.map((linha) => ({ date: linha.date, spendCents: linha.spendCents })),
        janela,
        diaCivilLocal(new Date(), FUSO),
      ),
      procedencia: {
        fonte: conexao ? "Meta Ads" : null,
        sincronizadoEm: conexao?.lastSyncedAt?.toISOString() ?? null,
        // A tela precisa distinguir "nunca sincronizou" de "sincronizou e
        // quebrou": o segundo significa que o número na tela está velho.
        status: conexao?.status ?? null,
        erro: conexao?.lastSyncError ?? null,
      },
    };
  }
}
