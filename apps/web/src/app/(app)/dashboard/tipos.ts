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

/** Null é "não houve base para calcular"; 0% afirmaria que ninguém converteu. */
export function formatRate(rate: number | null): string {
  if (rate === null) return "Sem base";
  return `${Math.round(rate * 100)}%`;
}

export function plural(quantidade: number, singular: string, muitos: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : muitos}`;
}
