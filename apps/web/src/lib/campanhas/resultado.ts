import { Trabalho } from "./trabalho";

/**
 * O objetivo da campanha, em três famílias que o dono do negócio reconhece.
 *
 * Três conceitos separados, e a tela nunca os mistura: o canal (Meta,
 * Google) diz de onde veio; o objetivo diz o que a campanha foi comprar; o
 * resultado diz o que se mediu de fato. Uma campanha de audiência não é
 * cobrada por venda, e uma de vendas não fica boa só porque foi vista.
 */
export type Objetivo = "vendas" | "local" | "audiencia";

export const OBJETIVOS: Objetivo[] = ["vendas", "local", "audiencia"];

export const ROTULO_DO_OBJETIVO: Record<Objetivo, string> = {
  vendas: "Vendas",
  local: "Presença local",
  audiencia: "Audiência",
};

/** Levar ao WhatsApp é o primeiro passo de uma venda: entra em Vendas, medida por conversa ou contato. */
export function objetivoDoTrabalho(trabalho: Trabalho): Objetivo {
  if (trabalho === "visto") return "audiencia";
  if (trabalho === "loja") return "local";
  return "vendas";
}

export function leObjetivo(valor: string | undefined): Objetivo | null {
  return OBJETIVOS.includes(valor as Objetivo) ? (valor as Objetivo) : null;
}

/** O que a tela sabe de uma campanha num período, já somado pelo servidor. */
export interface NumerosDaCampanha {
  plataforma: string;
  gastoCentavos: number;
  impressoes: number | null;
  cliques: number | null;
  visualizacoesDeVideo: number | null;
  conversasNaPlataforma: number | null;
  leads: number;
  vendas: number;
  receitaCentavos: number;
  vendasSemValor: number;
  /** Dias com gasto lançado; null sem gasto nenhum. */
  diasAtivos: number | null;
}

export interface AcoesNaLoja {
  ligacoes: number | null;
  rotas: number | null;
}

export type Tom = "bom" | "atencao" | "ruim" | "neutro";

export interface Resultado {
  /** Null quando a plataforma não mediu: "não sabemos", e não zero. */
  valor: number | null;
  /** Singular e plural, sempre explícitos ao lado do número. */
  unidade: [string, string];
  /** A segunda linha: de onde vem o número, ou o que ele não inclui. */
  detalhe: string;
  /** Custo por unidade do resultado, em centavos (pode ter fração). Null quando não dá para dividir. */
  custoCentavos: number | null;
  /** Uma frase curta, só quando os números a sustentam. */
  conclusao: { texto: string; tom: Tom } | null;
  /** Maior primeiro na ordem de atenção. */
  atencao: number;
}

/**
 * Abaixo disto a campanha ainda não disse o que é: três dias ou cinquenta
 * reais. Ela não é chamada de ruim, porque o que falta é amostra, não resultado.
 */
const DIAS_MINIMOS = 3;
const GASTO_MINIMO_CENTAVOS = 5_000;

export function poucaAmostra(n: NumerosDaCampanha): boolean {
  return (n.diasAtivos ?? 0) < DIAS_MINIMOS || n.gastoCentavos < GASTO_MINIMO_CENTAVOS;
}

const NOME_DA_PLATAFORMA: Record<string, string> = { META: "Meta", GOOGLE: "Google", TIKTOK: "TikTok" };

function contadoPor(plataforma: string): string {
  return `Contado pelo ${NOME_DA_PLATAFORMA[plataforma] ?? "canal"}`.replace("pelo Meta", "pela Meta");
}

function divide(gasto: number, quantidade: number | null): number | null {
  return gasto > 0 && quantidade && quantidade > 0 ? gasto / quantidade : null;
}

const PESO: Record<Tom, number> = { ruim: 3, atencao: 2, neutro: 0, bom: 0 };

function com(resultado: Omit<Resultado, "atencao">): Resultado {
  return { ...resultado, atencao: resultado.conclusao ? PESO[resultado.conclusao.tom] : 0 };
}

/**
 * O resultado de uma campanha, medido pelo objetivo dela.
 *
 * `medido` diz se o sistema recebe as conversas (WhatsApp recebendo): sem
 * isso, contato e venda não existem aqui, e a campanha de vendas é lida só
 * pelo que a plataforma contou, sem conclusão nenhuma.
 */
export function resultadoDaCampanha(
  objetivo: Objetivo,
  n: NumerosDaCampanha,
  opcoes: { medido: boolean; loja?: AcoesNaLoja | null },
): Resultado {
  const pouca = poucaAmostra(n);

  if (objetivo === "audiencia") {
    if (n.visualizacoesDeVideo && n.visualizacoesDeVideo > 0) {
      return com({
        valor: n.visualizacoesDeVideo,
        unidade: ["visualização", "visualizações"],
        detalhe: n.impressoes ? `Em ${inteiro(n.impressoes)} exibições. ${contadoPor(n.plataforma)}` : contadoPor(n.plataforma),
        custoCentavos: divide(n.gastoCentavos, n.visualizacoesDeVideo),
        conclusao: null,
      });
    }
    return com({
      valor: n.impressoes,
      unidade: ["exibição", "exibições"],
      detalhe: n.impressoes === null ? "A plataforma não informou a entrega" : contadoPor(n.plataforma),
      custoCentavos: null,
      conclusao: null,
    });
  }

  if (objetivo === "local") {
    const rotas = opcoes.loja?.rotas ?? null;
    const ligacoes = opcoes.loja?.ligacoes ?? null;
    if (rotas === null && ligacoes === null) {
      return com({
        valor: null,
        unidade: ["pedido de rota", "pedidos de rota"],
        detalhe: "Ligações e rotas não medidas nesta campanha",
        custoCentavos: null,
        conclusao: null,
      });
    }
    // Rota e ligação não se somam: são ações diferentes. A maior vai na
    // frente, a outra na segunda linha.
    const porRota = (rotas ?? 0) >= (ligacoes ?? 0);
    const principal = porRota ? (rotas ?? 0) : (ligacoes ?? 0);
    const outra = porRota
      ? ligacoes === null ? null : contagem(ligacoes, "clique para ligar", "cliques para ligar")
      : rotas === null ? null : contagem(rotas, "pedido de rota", "pedidos de rota");
    return com({
      valor: principal,
      unidade: porRota ? ["pedido de rota", "pedidos de rota"] : ["clique para ligar", "cliques para ligar"],
      detalhe: `${outra ? `${outra}. ` : ""}Visitas à loja não medidas`,
      custoCentavos: divide(n.gastoCentavos, principal),
      conclusao: pouca
        ? { texto: "Ainda com pouca amostra", tom: "neutro" }
        : principal > 0
          ? { texto: "Trazendo pessoas à loja", tom: "bom" }
          : { texto: "Sem ligação nem rota no período", tom: "ruim" },
    });
  }

  // Vendas.
  if (!opcoes.medido) {
    const conversas = n.conversasNaPlataforma;
    return com({
      valor: conversas ?? n.cliques,
      unidade: conversas !== null ? ["conversa aberta", "conversas abertas"] : ["clique", "cliques"],
      detalhe: contadoPor(n.plataforma),
      custoCentavos: divide(n.gastoCentavos, conversas ?? n.cliques),
      conclusao: null,
    });
  }

  if (n.vendas > 0) {
    const semValor = n.vendasSemValor > 0 ? `, ${contagem(n.vendasSemValor, "sem valor informado", "sem valor informado")}` : "";
    return com({
      valor: n.vendas,
      unidade: ["venda confirmada", "vendas confirmadas"],
      detalhe:
        n.receitaCentavos > 0 ? `${reais(n.receitaCentavos)} de receita atribuída${semValor}` : "Valor das vendas não informado",
      custoCentavos: divide(n.gastoCentavos, n.vendas),
      conclusao: pouca ? { texto: "Ainda com pouca amostra", tom: "neutro" } : { texto: "Trazendo vendas", tom: "bom" },
    });
  }

  if (n.leads > 0) {
    // Contato sem venda é normal no começo: só depois de duas semanas e dez
    // contatos a falta de venda vira assunto.
    const maduro = (n.diasAtivos ?? 0) >= 14 && n.leads >= 10;
    return com({
      valor: n.leads,
      unidade: ["contato", "contatos"],
      detalhe: "Nenhuma venda confirmada ainda",
      custoCentavos: divide(n.gastoCentavos, n.leads),
      conclusao: pouca
        ? { texto: "Ainda com pouca amostra", tom: "neutro" }
        : maduro
          ? { texto: "Contatos sem venda até agora", tom: "atencao" }
          : null,
    });
  }

  const conversas = n.conversasNaPlataforma ?? 0;
  return com({
    valor: 0,
    unidade: ["contato", "contatos"],
    detalhe:
      conversas > 0
        ? `${contagem(conversas, "conversa aberta", "conversas abertas")} contadas pela plataforma`
        : n.cliques
          ? `${contagem(n.cliques, "clique", "cliques")} no anúncio`
          : "Nenhum contato no período",
    custoCentavos: null,
    // Conversa aberta que não chegou como contato aponta para o rastreio, e
    // não para a campanha: é atenção, e não "ruim".
    conclusao: pouca
      ? { texto: "Ainda com pouca amostra", tom: "neutro" }
      : conversas > 0
        ? { texto: "Conversas abertas não chegaram como contato", tom: "atencao" }
        : n.gastoCentavos > 0
          ? { texto: "Gastando sem contato", tom: "ruim" }
          : null,
  });
}

export function contagem(n: number, um: string, varios: string): string {
  return `${inteiro(n)} ${n === 1 ? um : varios}`;
}

export function inteiro(n: number): string {
  return new Intl.NumberFormat("pt-BR").format(n);
}

/** Reais sem centavos, para valores que se leem de longe. */
export function reais(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(
    centavos / 100,
  );
}

/** Com centavos abaixo de R$ 10, onde o arredondamento apagaria a diferença. */
export function custo(centavos: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: centavos < 1000 ? 2 : 0,
    maximumFractionDigits: centavos < 1000 ? 2 : 0,
  }).format(centavos / 100);
}
