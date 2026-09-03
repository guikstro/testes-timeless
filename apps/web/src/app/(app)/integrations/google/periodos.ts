/**
 * As janelas da exportação de conversões.
 *
 * Fora do módulo de cliente de propósito. Isto morava em
 * `conversions-export.tsx`, que é componente de cliente, e a página, que é de
 * servidor, importava daqui: atravessando essa fronteira o Next troca todo
 * export por uma referência de cliente, e `PERIODOS.includes` estourava.
 */
export const PERIODOS = [30, 60, 90] as const;

export const PERIODO_PADRAO = 30;

export function periodoValido(pedido: unknown): number {
  const dias = Number(pedido);
  return (PERIODOS as readonly number[]).includes(dias) ? dias : PERIODO_PADRAO;
}
