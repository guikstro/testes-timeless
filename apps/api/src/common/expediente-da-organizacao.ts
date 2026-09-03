import { Expediente } from "./expediente";

/** As colunas de expediente como o Prisma as devolve. */
export interface ColunasDeExpediente {
  timezone: string;
  expedienteAtivo: boolean;
  expedienteDias: number[];
  expedienteInicio: number;
  expedienteFim: number;
}

/** Seleção pronta, para os dois lugares que precisam disto pedirem o mesmo. */
export const SELECAO_DE_EXPEDIENTE = {
  timezone: true,
  expedienteAtivo: true,
  expedienteDias: true,
  expedienteInicio: true,
  expedienteFim: true,
} as const;

export function expedienteDa(organizacao: ColunasDeExpediente | null): Expediente | undefined {
  // Sem organização carregada, nada de expediente: cair no relógio corrido é
  // o comportamento antigo, e é preferível a inventar um horário.
  if (!organizacao?.expedienteAtivo) return undefined;

  return {
    ativo: true,
    dias: organizacao.expedienteDias,
    inicioMinutos: organizacao.expedienteInicio,
    fimMinutos: organizacao.expedienteFim,
    fuso: organizacao.timezone,
  };
}
