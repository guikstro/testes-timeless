/**
 * As métricas que a tela de campanhas sabe mostrar, e quais mostrar.
 *
 * Cada campanha se mede por um número diferente. Uma de tráfego é boa quando
 * o clique sai barato; uma de reconhecimento, quando a impressão sai barata;
 * uma de mensagens, quando a conversa vira lead. Mostrar todas as colunas o
 * tempo todo esconde o número que importa no meio dos que não importam, então
 * a tela sugere um conjunto pelo objetivo das campanhas e deixa trocar.
 */

export type Metrica =
  | "impressoes"
  | "cpm"
  | "cliques"
  | "ctr"
  | "cpc"
  | "conversas"
  | "custoPorConversa"
  | "leads"
  | "custoPorLead"
  | "vendas"
  | "receita"
  | "retorno";

export interface DefinicaoDaMetrica {
  chave: Metrica;
  rotulo: string;
  /**
   * Vem da plataforma de anúncios, e não do WhatsApp: aparece mesmo sem
   * WhatsApp conectado, porque não depende de lead nenhum.
   */
  daPlataforma: boolean;
  /** Custo: subir é piorar, e a variação aparece invertida. */
  custo: boolean;
  /** O que a métrica quer dizer, para o pé da tabela. */
  definicao: string;
}

/**
 * Na ordem do caminho do dinheiro: o anúncio aparece, é clicado, abre uma
 * conversa, vira lead, vira venda. As da plataforma vêm antes das do
 * WhatsApp, e é isso que deixa as que dependem do WhatsApp lado a lado na
 * tabela quando ele não está medindo.
 */
export const METRICAS: DefinicaoDaMetrica[] = [
  {
    chave: "impressoes",
    rotulo: "Impressões",
    daPlataforma: true,
    custo: false,
    definicao: "Quantas vezes o anúncio apareceu na tela de alguém. A mesma pessoa pode contar mais de uma vez.",
  },
  {
    chave: "cpm",
    rotulo: "CPM",
    daPlataforma: true,
    custo: true,
    definicao: "Quanto custou cada mil impressões. É o preço de aparecer.",
  },
  {
    chave: "cliques",
    rotulo: "Cliques",
    daPlataforma: true,
    custo: false,
    definicao: "Quantos cliques o anúncio levou, como a plataforma conta.",
  },
  {
    chave: "ctr",
    rotulo: "CTR",
    daPlataforma: true,
    custo: false,
    definicao: "Cliques divididos por impressões. Diz se quem viu o anúncio se interessou.",
  },
  {
    chave: "cpc",
    rotulo: "CPC",
    daPlataforma: true,
    custo: true,
    definicao: "Quanto custou cada clique.",
  },
  {
    chave: "conversas",
    rotulo: "Conversas na Meta",
    daPlataforma: true,
    custo: false,
    definicao: "Quantas pessoas a Meta diz que começaram uma conversa no WhatsApp a partir do anúncio.",
  },
  {
    chave: "custoPorConversa",
    rotulo: "Custo por conversa",
    daPlataforma: true,
    custo: true,
    definicao: "Quanto custou cada conversa que a Meta contou.",
  },
  {
    chave: "leads",
    rotulo: "Leads aqui",
    daPlataforma: false,
    custo: false,
    definicao:
      "Quem mandou mensagem no WhatsApp conectado e foi ligado a esta campanha. Fica abaixo da Meta quando a conversa não chegou ao número conectado.",
  },
  {
    chave: "custoPorLead",
    rotulo: "Custo por lead",
    daPlataforma: false,
    custo: true,
    definicao: "O investimento dividido pelos leads que chegaram aqui.",
  },
  {
    chave: "vendas",
    rotulo: "Vendas",
    daPlataforma: false,
    custo: false,
    definicao: "Leads desta campanha que viraram venda.",
  },
  {
    chave: "receita",
    rotulo: "Receita",
    daPlataforma: false,
    custo: false,
    definicao: "A soma das vendas com valor registrado.",
  },
  {
    chave: "retorno",
    rotulo: "Retorno",
    daPlataforma: false,
    custo: false,
    definicao: "Receita das vendas dividida pelo investimento. 2,00x quer dizer que cada real voltou dobrado.",
  },
];

const ORDEM = METRICAS.map((metrica) => metrica.chave);

export const DEFINICAO: Record<Metrica, DefinicaoDaMetrica> = Object.fromEntries(
  METRICAS.map((metrica) => [metrica.chave, metrica]),
) as Record<Metrica, DefinicaoDaMetrica>;

export type Conjunto = "entrega" | "conversas" | "vendas" | "todas";

export const CONJUNTOS: Record<Conjunto, { rotulo: string; metricas: Metrica[] }> = {
  entrega: { rotulo: "Entrega", metricas: ["impressoes", "cpm", "cliques", "ctr", "cpc"] },
  conversas: { rotulo: "Conversas e leads", metricas: ["cliques", "ctr", "conversas", "custoPorConversa", "leads", "custoPorLead"] },
  // O conjunto que a tela mostrava sozinha antes de dar para escolher.
  vendas: { rotulo: "Vendas", metricas: ["conversas", "leads", "vendas", "receita", "custoPorLead", "retorno"] },
  todas: { rotulo: "Todas", metricas: ORDEM },
};

/**
 * As métricas pedidas na URL, na ordem do catálogo.
 *
 * Texto de fora: o que não é métrica conhecida é ignorado em vez de quebrar a
 * tela. Null quando não sobra nenhuma, que é "ninguém escolheu": aí vale a
 * sugestão.
 */
export function leMetricas(texto: string | null | undefined): Metrica[] | null {
  if (!texto) return null;
  const pedidas = new Set(texto.split(",").map((parte) => parte.trim()));
  const validas = ORDEM.filter((chave) => pedidas.has(chave));
  return validas.length > 0 ? validas : null;
}

/** Liga ou desliga uma métrica, sem deixar a tabela sem nenhuma. */
export function alterna(atuais: Metrica[], chave: Metrica): Metrica[] {
  const ligada = atuais.includes(chave);
  if (ligada && atuais.length === 1) return atuais;
  const novas = new Set(ligada ? atuais.filter((atual) => atual !== chave) : [...atuais, chave]);
  return ORDEM.filter((metrica) => novas.has(metrica));
}

/** As métricas de um conjunto, na ordem do catálogo: a mesma URL para a mesma escolha. */
export function metricasDoConjunto(conjunto: Conjunto): Metrica[] {
  return ORDEM.filter((metrica) => CONJUNTOS[conjunto].metricas.includes(metrica));
}

/** O conjunto que tem exatamente estas métricas, se algum tiver. */
export function conjuntoDe(metricas: Metrica[]): Conjunto | null {
  const chave = metricas.join(",");
  const achado = (Object.keys(CONJUNTOS) as Conjunto[]).find((conjunto) => metricasDoConjunto(conjunto).join(",") === chave);
  return achado ?? null;
}

type Grupo = "reconhecimento" | "trafego" | "engajamento" | "mensagens" | "cadastros" | "vendas" | "app";

/**
 * O objetivo da Meta em grupos que quem anuncia reconhece.
 *
 * A Meta trocou os nomes em 2022 (de LINK_CLICKS para OUTCOME_TRAFFIC, por
 * exemplo), e campanhas antigas continuam com o nome velho: os dois caem no
 * mesmo grupo.
 */
const GRUPO_DO_OBJETIVO: Record<string, Grupo> = {
  OUTCOME_AWARENESS: "reconhecimento",
  BRAND_AWARENESS: "reconhecimento",
  REACH: "reconhecimento",
  VIDEO_VIEWS: "reconhecimento",
  OUTCOME_TRAFFIC: "trafego",
  LINK_CLICKS: "trafego",
  OUTCOME_ENGAGEMENT: "engajamento",
  POST_ENGAGEMENT: "engajamento",
  PAGE_LIKES: "engajamento",
  EVENT_RESPONSES: "engajamento",
  MESSAGES: "mensagens",
  OUTCOME_LEADS: "cadastros",
  LEAD_GENERATION: "cadastros",
  OUTCOME_SALES: "vendas",
  CONVERSIONS: "vendas",
  PRODUCT_CATALOG_SALES: "vendas",
  STORE_VISITS: "vendas",
  OUTCOME_APP_PROMOTION: "app",
  APP_INSTALLS: "app",
};

const ROTULO_DO_GRUPO: Record<Grupo, string> = {
  reconhecimento: "Reconhecimento",
  trafego: "Tráfego",
  engajamento: "Engajamento",
  mensagens: "Mensagens",
  cadastros: "Cadastros",
  vendas: "Vendas",
  app: "Promoção do app",
};

/**
 * Engajamento entra com conversas porque, neste produto, quase toda campanha
 * de engajamento é a de mensagem no WhatsApp.
 */
const CONJUNTO_DO_GRUPO: Record<Grupo, Conjunto> = {
  reconhecimento: "entrega",
  trafego: "entrega",
  app: "entrega",
  engajamento: "conversas",
  mensagens: "conversas",
  cadastros: "conversas",
  vendas: "vendas",
};

/** O objetivo como quem anuncia o chama, ou null quando a plataforma não informou. */
export function rotuloDoObjetivo(objetivo: string | null | undefined): string | null {
  const grupo = objetivo ? GRUPO_DO_OBJETIVO[objetivo] : undefined;
  return grupo ? ROTULO_DO_GRUPO[grupo] : null;
}

/**
 * O conjunto sugerido pelo objetivo das campanhas do período.
 *
 * Pesado pelo investimento: o conjunto que importa é o da campanha onde o
 * dinheiro está, e não o da campanha de teste de R$ 20. Sem objetivo
 * conhecido, fica o conjunto de vendas, que é o que a tela sempre mostrou.
 */
export function sugereConjunto(campanhas: { objetivo: string | null; gastoCentavos: number }[]): {
  conjunto: Conjunto;
  objetivo: string | null;
} {
  const pesoPorGrupo = new Map<Grupo, number>();
  for (const campanha of campanhas) {
    const grupo = campanha.objetivo ? GRUPO_DO_OBJETIVO[campanha.objetivo] : undefined;
    if (!grupo) continue;
    // Peso mínimo de 1: uma campanha sem gasto ainda diz algo sobre o tipo de conta.
    pesoPorGrupo.set(grupo, (pesoPorGrupo.get(grupo) ?? 0) + Math.max(campanha.gastoCentavos, 1));
  }

  const [principal] = [...pesoPorGrupo.entries()].sort((a, b) => b[1] - a[1]);
  if (!principal) return { conjunto: "vendas", objetivo: null };
  return { conjunto: CONJUNTO_DO_GRUPO[principal[0]], objetivo: ROTULO_DO_GRUPO[principal[0]] };
}

/** CTR em porcentagem, com duas casas: 1,23%. */
export function formataTaxa(fracao: number): string {
  return `${(fracao * 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
