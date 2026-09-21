/**
 * Desempenho por anúncio: o que cada criativo custou e o que ele trouxe.
 *
 * É o nível em que a decisão acontece. Saber que a campanha custou dez mil e
 * trouxe cem leads não diz qual criativo desligar; saber que um deles traz
 * lead a vinte e oito reais e outro a cento e dez, diz.
 *
 * O produto já sabia qual anúncio trouxe cada lead, porque o clique rastreado
 * guarda o id do anúncio e a atribuição o preserva. Faltava o custo no mesmo
 * nível, e é isso que esta junção usa.
 */

export interface GastoDoAnuncio {
  adId: string;
  externalId: string;
  name: string;
  status: string;
  campanha: string;
  spendCents: number;
  impressions: number;
  clicks: number;
}

/** Um lead já reduzido ao que importa aqui: o anúncio de origem e o que ele virou. */
export interface LeadDoAnuncio {
  adExternalId: string | null;
  qualifiedAt: Date | null;
  wonAt: Date | null;
  sale: { amountCents: number | null } | null;
}

export interface DesempenhoDoAnuncio {
  adId: string;
  externalId: string;
  name: string;
  status: string;
  campanha: string;
  gastoCentavos: number;
  impressoes: number;
  cliques: number;
  leads: number;
  qualificados: number;
  vendas: number;
  receitaCentavos: number;
  /** Custo por lead. Null sem lead nenhum: dividir por zero não é caro, é desconhecido. */
  custoPorLeadCentavos: number | null;
  /** Custo por cliente. Null sem venda. */
  custoPorVendaCentavos: number | null;
  /**
   * Retorno sobre o investimento. Null sem gasto registrado.
   *
   * Zero é um resultado legítimo: gastou e não voltou nada. Só a ausência de
   * gasto torna a conta impossível.
   */
  retorno: number | null;
}

export interface TotaisDosAnuncios {
  gastoCentavos: number;
  leads: number;
  vendas: number;
  receitaCentavos: number;
  /** Anúncios que gastaram e não trouxeram lead nenhum. É a lista para agir. */
  semRetorno: number;
}

function divide(numerador: number, denominador: number): number | null {
  return denominador > 0 ? Math.round(numerador / denominador) : null;
}

export function agregaDesempenhoPorAnuncio(
  gastos: GastoDoAnuncio[],
  leads: LeadDoAnuncio[],
): { anuncios: DesempenhoDoAnuncio[]; totais: TotaisDosAnuncios; semAnuncio: number } {
  const porAnuncio = new Map<string, DesempenhoDoAnuncio>();

  for (const gasto of gastos) {
    porAnuncio.set(gasto.externalId, {
      adId: gasto.adId,
      externalId: gasto.externalId,
      name: gasto.name,
      status: gasto.status,
      campanha: gasto.campanha,
      gastoCentavos: gasto.spendCents,
      impressoes: gasto.impressions,
      cliques: gasto.clicks,
      leads: 0,
      qualificados: 0,
      vendas: 0,
      receitaCentavos: 0,
      custoPorLeadCentavos: null,
      custoPorVendaCentavos: null,
      retorno: null,
    });
  }

  /*
    Lead cujo anúncio não está na lista de gastos fica de fora do detalhe e
    entra em `semAnuncio`.

    Acontece de verdade em dois casos: o anúncio foi apagado da conta, e o
    lead veio de um clique sem identificação de anúncio. Empurrar esses leads
    para dentro de qualquer linha inflaria o desempenho de um criativo que não
    os trouxe, e é justamente o tipo de dedução que este produto recusa.
  */
  let semAnuncio = 0;

  for (const lead of leads) {
    const linha = lead.adExternalId ? porAnuncio.get(lead.adExternalId) : undefined;
    if (!linha) {
      semAnuncio += 1;
      continue;
    }

    linha.leads += 1;
    if (lead.qualifiedAt) linha.qualificados += 1;
    if (lead.wonAt) {
      linha.vendas += 1;
      linha.receitaCentavos += lead.sale?.amountCents ?? 0;
    }
  }

  for (const linha of porAnuncio.values()) {
    linha.custoPorLeadCentavos = divide(linha.gastoCentavos, linha.leads);
    linha.custoPorVendaCentavos = divide(linha.gastoCentavos, linha.vendas);
    linha.retorno =
      linha.gastoCentavos > 0 ? Math.round((linha.receitaCentavos / linha.gastoCentavos) * 100) / 100 : null;
  }

  /*
    Ordenado pelo que custou mais.

    A ordem é informação, e aqui a pergunta é onde está o dinheiro: o anúncio
    que consome mais verba é o que mais importa acertar, mesmo quando vai bem.
    Alfabética seria desistir de informar.
  */
  const anuncios = [...porAnuncio.values()].sort((a, b) => b.gastoCentavos - a.gastoCentavos);

  return {
    anuncios,
    semAnuncio,
    totais: {
      gastoCentavos: anuncios.reduce((soma, a) => soma + a.gastoCentavos, 0),
      leads: anuncios.reduce((soma, a) => soma + a.leads, 0),
      vendas: anuncios.reduce((soma, a) => soma + a.vendas, 0),
      receitaCentavos: anuncios.reduce((soma, a) => soma + a.receitaCentavos, 0),
      semRetorno: anuncios.filter((a) => a.gastoCentavos > 0 && a.leads === 0).length,
    },
  };
}
