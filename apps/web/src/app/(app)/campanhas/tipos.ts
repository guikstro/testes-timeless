/** O que a rota `GET /analytics/campanhas` devolve. */

import type { Cobertura, Parcial } from "@/components/aviso-de-cobertura";

export interface Variacao {
  /** Fração: 0.15 é quinze por cento acima. Null quando o período anterior era zero. */
  delta: number | null;
  anterior: number;
}

export interface PeriodoAtivo {
  de: string;
  ate: string;
  /** Dias com gasto lançado, não dias corridos. */
  dias: number;
}

export interface DesempenhoDeCampanha {
  id: string;
  externalId: string;
  nome: string;
  plataforma: string;
  /** Como a plataforma descreve a campanha hoje: ACTIVE, PAUSED. */
  status: string;
  /** Dia em que ela foi criada na plataforma, quando se sabe. */
  criadaNaPlataformaEm: string | null;
  /** O objetivo na plataforma, como ela escreve: OUTCOME_TRAFFIC. Null quando não informou. */
  objetivo: string | null;
  /** Conversas que a própria plataforma diz ter iniciado. Null quando não se sabe. */
  conversasNaPlataforma: number | null;
  /** Falso quando parte dos dias não trouxe a contagem: o número é um piso. */
  conversasCompletas: boolean;
  ativo: PeriodoAtivo | null;
  gastoCentavos: number;
  /** Entrega na plataforma. Null quando nenhum dia trouxe o número: "não sabemos", e não zero. */
  impressoes: number | null;
  cliques: number | null;
  /** Falso quando parte dos dias não trouxe a entrega: os números são um piso. */
  entregaCompleta: boolean;
  /** Cliques sobre impressões, de 0 a 1. */
  ctr: number | null;
  cpmCentavos: number | null;
  cpcCentavos: number | null;
  custoPorConversaCentavos: number | null;
  leads: number;
  qualificados: number;
  vendas: number;
  receitaCentavos: number;
  vendasSemValor: number;
  custoPorLeadCentavos: number | null;
  custoPorVendaCentavos: number | null;
  roas: number | null;
}

export interface CampanhaComparada {
  externalId: string;
  nome: string;
  plataforma: string;
  status: string;
  criadaNaPlataformaEm: string | null;
  objetivo: string | null;
  /** Null quando a campanha não teve atividade naquele período. Não é zero: é ausência. */
  atual: DesempenhoDeCampanha | null;
  anterior: DesempenhoDeCampanha | null;
  variacao: {
    gastoCentavos: Variacao;
    leads: Variacao;
    vendas: Variacao;
    receitaCentavos: Variacao;
  } | null;
}

export interface DesempenhoDeCampanhas {
  periodo: { de: string; ate: string };
  comparacao: { de: string; ate: string } | null;
  /** Desde quando há número de anúncio aqui. Ausente na API anterior. */
  cobertura?: Cobertura;
  /** O período e a comparação começam antes disso: a porcentagem entre eles não vale. */
  parcial?: Parcial;
  campanhas: CampanhaComparada[];
  semCampanha: { atual: number; anterior: number };
  totais: {
    gastoCentavos: number;
    leads: number;
    vendas: number;
    receitaCentavos: number;
    conversasNaPlataforma: number | null;
    impressoes: number | null;
    cliques: number | null;
    entregaCompleta: boolean;
    ctr: number | null;
    cpmCentavos: number | null;
    cpcCentavos: number | null;
    custoPorConversaCentavos: number | null;
  };
}
