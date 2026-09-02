/** O que a rota `GET /analytics/campanhas` devolve. */

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
  ativo: PeriodoAtivo | null;
  gastoCentavos: number;
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
  campanhas: CampanhaComparada[];
  semCampanha: { atual: number; anterior: number };
  totais: { gastoCentavos: number; leads: number; vendas: number; receitaCentavos: number };
}
