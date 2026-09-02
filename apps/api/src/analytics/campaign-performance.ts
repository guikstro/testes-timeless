/**
 * Desempenho por campanha: junta o que cada campanha custou com o que ela
 * trouxe de volta.
 *
 * O sistema já sabia as duas metades em separado (o gasto, pela importação de
 * CSV ou pela sincronização; o lead, pela atribuição do clique), mas nunca as
 * cruzava. Sem o cruzamento dá para dizer quanto se gastou e quantos leads
 * entraram, não qual campanha traz cliente que paga.
 *
 * A regra que organiza tudo aqui é que uma organização roda várias campanhas
 * ao longo do ano, em períodos diferentes: uma em março, outra em julho. Por
 * isso cada linha carrega o seu próprio período ativo. Duas campanhas lado a
 * lado numa mesma janela convidam a comparar totais, e comparar o total de
 * uma que viveu doze dias com o de outra que viveu sessenta leva à conclusão
 * errada. Com o período ativo à vista, quem lê sabe que os totais não são
 * comparáveis, e a tela pode ajustar a janela à vida de uma campanha só.
 */

import { compara, Variacao } from "./overview-aggregation";

export interface LinhaDeGasto {
  date: Date;
  spendCents: number;
}

export interface CampanhaComGasto {
  id: string;
  externalId: string;
  name: string;
  platform: string;
  spend: LinhaDeGasto[];
}

/**
 * Um lead já reduzido ao que importa aqui: a campanha de origem e o que ele
 * virou. `campaignExternalId` é o id da plataforma, porque é ele que o clique
 * guarda, e não o id interno da nossa tabela.
 */
export interface LeadAtribuido {
  campaignExternalId: string | null;
  qualifiedAt: Date | null;
  wonAt: Date | null;
  sale: { amountCents: number | null } | null;
}

export interface PeriodoAtivo {
  /** Dia civil, no formato YYYY-MM-DD. */
  de: string;
  ate: string;
  /**
   * Dias com gasto lançado, não dias corridos entre as duas pontas. Uma
   * campanha pausada no meio do mês tem menos dias ativos que o intervalo
   * sugere, e é o número de dias ativos que torna o gasto médio honesto.
   */
  dias: number;
}

export interface DesempenhoDeCampanha {
  id: string;
  externalId: string;
  nome: string;
  plataforma: string;
  /** Null quando não há nenhum gasto lançado para a campanha dentro da janela. */
  ativo: PeriodoAtivo | null;
  gastoCentavos: number;
  leads: number;
  qualificados: number;
  vendas: number;
  receitaCentavos: number;
  /**
   * Vendas fechadas sem valor registrado. Elas entram em `vendas` mas não em
   * `receitaCentavos`, então o ROAS da linha é um piso, não o número final. A
   * tela precisa disto para não apresentar como completo um cálculo que não é.
   */
  vendasSemValor: number;
  custoPorLeadCentavos: number | null;
  custoPorVendaCentavos: number | null;
  roas: number | null;
}

export interface DesempenhoPorCampanha {
  campanhas: DesempenhoDeCampanha[];
  /**
   * Leads da janela que nenhuma campanha reivindica: sem atribuição, ou
   * atribuídos a um id que não corresponde a campanha nenhuma desta
   * organização. Vai junto porque a soma das linhas não fecha com o total de
   * leads, e uma tabela que não explica a diferença passa a impressão de que
   * as campanhas respondem por tudo.
   */
  semCampanha: number;
}

/** Dia civil de uma data gravada na meia-noite UTC, que é como o gasto é guardado. */
function diaCivil(data: Date): string {
  return data.toISOString().slice(0, 10);
}

function periodoAtivo(gastos: LinhaDeGasto[]): PeriodoAtivo | null {
  if (gastos.length === 0) return null;

  const dias = gastos.map((linha) => diaCivil(linha.date)).sort();
  // Set porque a mesma campanha pode ter mais de uma linha no mesmo dia se o
  // gasto veio de fontes diferentes, e contar duas vezes inflaria os dias.
  const distintos = new Set(dias);

  return { de: dias[0], ate: dias[dias.length - 1], dias: distintos.size };
}

/**
 * Divisão que devolve null em vez de zero ou infinito quando não dá para
 * dividir. Um custo por lead de R$ 0,00 numa campanha sem leads afirmaria que
 * ela foi eficiente, quando o caso é que ela não produziu nada.
 */
function divide(numerador: number, denominador: number): number | null {
  if (denominador <= 0) return null;
  return numerador / denominador;
}

export function agregaDesempenhoPorCampanha(
  campanhas: CampanhaComGasto[],
  leads: LeadAtribuido[],
): DesempenhoPorCampanha {
  const porExternalId = new Map<string, DesempenhoDeCampanha>();

  for (const campanha of campanhas) {
    porExternalId.set(campanha.externalId, {
      id: campanha.id,
      externalId: campanha.externalId,
      nome: campanha.name,
      plataforma: campanha.platform,
      ativo: periodoAtivo(campanha.spend),
      gastoCentavos: campanha.spend.reduce((soma, linha) => soma + linha.spendCents, 0),
      leads: 0,
      qualificados: 0,
      vendas: 0,
      receitaCentavos: 0,
      vendasSemValor: 0,
      custoPorLeadCentavos: null,
      custoPorVendaCentavos: null,
      roas: null,
    });
  }

  let semCampanha = 0;

  for (const lead of leads) {
    const linha = lead.campaignExternalId ? porExternalId.get(lead.campaignExternalId) : undefined;
    if (!linha) {
      semCampanha += 1;
      continue;
    }

    linha.leads += 1;
    if (lead.qualifiedAt) linha.qualificados += 1;
    if (lead.wonAt) {
      linha.vendas += 1;
      if (lead.sale && lead.sale.amountCents !== null) {
        linha.receitaCentavos += lead.sale.amountCents;
      } else {
        linha.vendasSemValor += 1;
      }
    }
  }

  const linhas = [...porExternalId.values()].map((linha) => {
    const cpl = divide(linha.gastoCentavos, linha.leads);
    const cpa = divide(linha.gastoCentavos, linha.vendas);
    return {
      ...linha,
      // Sem gasto lançado não existe custo por lead: a campanha pode ter
      // rodado e o gasto ainda não ter sido importado, e nesse caso um zero
      // seria uma afirmação falsa em vez de uma lacuna.
      custoPorLeadCentavos: linha.gastoCentavos > 0 && cpl !== null ? Math.round(cpl) : null,
      custoPorVendaCentavos: linha.gastoCentavos > 0 && cpa !== null ? Math.round(cpa) : null,
      roas: divide(linha.receitaCentavos, linha.gastoCentavos),
    };
  });

  // Maior gasto primeiro: é onde o dinheiro está, e por isso onde uma decisão
  // de cortar ou reforçar tem mais efeito. Empate desce para o volume de leads.
  linhas.sort((a, b) => b.gastoCentavos - a.gastoCentavos || b.leads - a.leads);

  return { campanhas: linhas, semCampanha };
}

/**
 * Comparação entre dois períodos escolhidos à mão, por exemplo março contra
 * julho.
 *
 * A união das duas listas é deliberada: uma campanha que rodou só num dos dois
 * meses precisa aparecer, porque "não rodou" é metade da explicação de uma
 * queda de leads. Por isso cada lado é `DesempenhoDeCampanha | null` em vez de
 * uma linha zerada, que diria que a campanha rodou e não produziu nada.
 */
export interface CampanhaComparada {
  externalId: string;
  nome: string;
  plataforma: string;
  atual: DesempenhoDeCampanha | null;
  anterior: DesempenhoDeCampanha | null;
  /** Preenchida só quando a campanha teve atividade nos dois períodos. */
  variacao: {
    gastoCentavos: Variacao;
    leads: Variacao;
    vendas: Variacao;
    receitaCentavos: Variacao;
  } | null;
}

export interface ComparacaoDeCampanhas {
  campanhas: CampanhaComparada[];
  semCampanha: { atual: number; anterior: number };
}

export function comparaDesempenho(
  atual: DesempenhoPorCampanha,
  anterior: DesempenhoPorCampanha,
): ComparacaoDeCampanhas {
  const doAtual = new Map(atual.campanhas.map((linha) => [linha.externalId, linha]));
  const doAnterior = new Map(anterior.campanhas.map((linha) => [linha.externalId, linha]));

  const todos = new Set([...doAtual.keys(), ...doAnterior.keys()]);

  const campanhas = [...todos].map((externalId) => {
    const agora = doAtual.get(externalId) ?? null;
    const antes = doAnterior.get(externalId) ?? null;
    // O nome vem do período atual quando existe: uma campanha renomeada deve
    // aparecer com o nome que ela tem hoje, não com o que tinha antes.
    const referencia = agora ?? antes!;

    return {
      externalId,
      nome: referencia.nome,
      plataforma: referencia.plataforma,
      atual: agora,
      anterior: antes,
      variacao:
        agora && antes
          ? {
              gastoCentavos: compara(agora.gastoCentavos, antes.gastoCentavos),
              leads: compara(agora.leads, antes.leads),
              vendas: compara(agora.vendas, antes.vendas),
              receitaCentavos: compara(agora.receitaCentavos, antes.receitaCentavos),
            }
          : null,
    };
  });

  // Quem gastou mais no período escolhido vem primeiro; quem só existe no
  // período de comparação desce para o fim, onde é lido como histórico.
  campanhas.sort(
    (a, b) =>
      (b.atual?.gastoCentavos ?? -1) - (a.atual?.gastoCentavos ?? -1) ||
      (b.anterior?.gastoCentavos ?? 0) - (a.anterior?.gastoCentavos ?? 0),
  );

  return { campanhas, semCampanha: { atual: atual.semCampanha, anterior: anterior.semCampanha } };
}
