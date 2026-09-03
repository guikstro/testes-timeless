/**
 * As janelas que o relatório oferece.
 *
 * Num arquivo próprio, sem `"use client"`, de propósito. Isto morava dentro de
 * `relatorio-view.tsx`, que é componente de cliente, e a página, que é de
 * servidor, importava daqui. Atravessando essa fronteira o Next substitui todo
 * export do módulo por uma referência de cliente: no servidor, `PERIODOS`
 * deixava de ser um vetor e `PERIODOS.includes` estourava, derrubando a tela
 * inteira.
 *
 * O tipo continuava certo, porque isso não é erro de tipo: é o empacotador
 * trocando o valor em tempo de execução. Só aparece abrindo a página.
 */
export const PERIODOS = [7, 30, 90] as const;

/** A janela padrão quando a pedida não é uma das oferecidas. */
export const PERIODO_PADRAO = 30;

/** A janela pedida, se for uma das oferecidas; senão, a padrão. */
export function periodoValido(pedido: unknown): number {
  const dias = Number(pedido);
  return (PERIODOS as readonly number[]).includes(dias) ? dias : PERIODO_PADRAO;
}
