export interface SituacaoDaVerba {
  amountCents: number;
  de: string;
  ate: string | null;
  gastoCentavos: number;
  saldoCentavos: number;
  consumidoPorCento: number | null;
  diasCorridos: number;
  diasRestantes: number | null;
  ritmoDiarioCentavos: number | null;
  acabaEm: string | null;
  ritmoIdealCentavos: number | null;
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
  custoPorLeadCentavos: number | null;
  custoPorVendaCentavos: number | null;
  retorno: number | null;
}

export interface Anuncios {
  periodo: { de: string; ate: string };
  anuncios: DesempenhoDoAnuncio[];
  semAnuncio: number;
  totais: {
    gastoCentavos: number;
    leads: number;
    vendas: number;
    receitaCentavos: number;
    semRetorno: number;
  };
  /** De onde o número veio e de quando ele é. Ver o rodapé da tela. */
  procedencia: {
    fonte: string | null;
    sincronizadoEm: string | null;
    status: string | null;
    erro: string | null;
  };
}

export interface Verba {
  id: string;
  startsOn: string;
  endsOn: string | null;
  amountCents: number;
  label: string | null;
}
