import { DailyPoint } from "./leads-area-chart";

/**
 * O que a rota de visão geral devolve, e os dois ajudantes que todas as abas
 * usam. Fora do `page.tsx` porque o Next não deixa uma página exportar nada
 * além do componente e da configuração dela.
 */
export interface OriginBucket {
  key: string;
  label: string;
  leads: number;
  qualified: number;
  meetings: number;
  won: number;
  disqualified: number;
  revenueCents: number;
}

export interface Variacao {
  delta: number | null;
  anterior: number;
}

export interface Overview {
  period: { days: number; from: string; to: string };
  totals: {
    leads: number;
    disqualified: number;
    workable: number;
    qualified: number;
    meetings: number;
    won: number;
    revenueCents: number;
    qualificationRate: number | null;
    closeRate: number | null;
  };
  comparacao: {
    leads: Variacao;
    qualified: Variacao;
    meetings: Variacao;
    won: Variacao;
    revenueCents: Variacao;
  };
  atendimento: {
    medianaPrimeiraRespostaSegundos: number | null;
    respondidos: number;
    semResposta: number;
    aguardando: number;
  };
  byOrigin: OriginBucket[];
  daily: DailyPoint[];
  chegadas: { diaSemana: number; faixa: number; leads: number }[];
  setup: { whatsappConnected: boolean; metaConnected: boolean; trackingLinkCount: number };
}

/** As etapas da aba Funil, na ordem em que o lead anda. */
export type ChaveDaEtapa = "leads" | "contatados" | "qualificados" | "reuniao" | "vendas";

export interface EtapaMedida {
  chave: ChaveDaEtapa;
  /** Quem chegou nesta etapa ou foi além dela. */
  quantidade: number;
  /** Fração da etapa anterior que chegou aqui. Null na primeira, e quando a anterior está vazia. */
  conversao: number | null;
  /** Pararam aqui e foram marcados como perdidos. */
  perdidos: number;
  /** Pararam aqui e continuam abertos. */
  abertos: number;
}

export interface OpcaoDeFiltro {
  valor: string;
  rotulo: string;
  /** Leads do período com este valor, antes de qualquer recorte. */
  leads: number;
}

/** O que a rota do funil devolve. */
export interface FunilDoPeriodo {
  periodo: { de: string; ate: string; dias: number };
  filtros: { campanha: string | null; origem: string | null; responsavel: string | null };
  /** Leads do período antes dos recortes. */
  totalNoPeriodo: number;
  funil: {
    etapas: EtapaMedida[];
    conversaoTotal: number | null;
    perdidos: number;
    abertos: number;
    motivosDePerda: { motivo: string | null; quantidade: number }[];
  };
  opcoes: {
    campanhas: OpcaoDeFiltro[];
    origens: OpcaoDeFiltro[];
    responsaveis: { id: string; name: string }[];
  };
}

/** Os números da Página num período. Null em cada um quando nenhum dia trouxe a métrica. */
export interface ResumoDaPagina {
  visualizacoes: number | null;
  visitas: number | null;
  interacoes: number | null;
  novosSeguidores: number | null;
  deixaramDeSeguir: number | null;
  seguidoresLiquidos: number | null;
  /** Total de seguidores no último dia lido do período. */
  seguidores: number | null;
  videos: number | null;
  tempoDeVideoSegundos: number | null;
}

/** O que a rota `GET /analytics/pagina` devolve. */
export interface InsightsDaPagina {
  periodo: { de: string; ate: string };
  anterior: { de: string; ate: string };
  /** Null quando nenhuma Página foi escolhida em Integrações. */
  pagina: { id: string; nome: string | null; sincronizadaEm: string | null; erro: string | null } | null;
  atual: ResumoDaPagina;
  comparacao: ResumoDaPagina;
  /** Pessoas únicas nos 7 e nos 28 dias até `ate`: a Meta não dá o total de um período qualquer. */
  visualizadores: { semana: { valor: number; ate: string } | null; mes: { valor: number; ate: string } | null };
  porDia: { dia: string; visualizacoes: number | null; visitas: number | null; interacoes: number | null; novosSeguidores: number | null }[];
}

/** Null é "não houve base para calcular"; 0% afirmaria que ninguém converteu. */
export function formatRate(rate: number | null): string {
  if (rate === null) return "Sem base";
  return `${Math.round(rate * 100)}%`;
}

export function plural(quantidade: number, singular: string, muitos: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : muitos}`;
}
