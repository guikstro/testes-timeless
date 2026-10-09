/** Os apelidos que o teste aceita na linha de comando. */
export const MODELOS = {
  haiku: "claude-haiku-4-5",
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
} as const;

/**
 * Dólares por milhão de tokens, da tabela pública da API (25/09/2026).
 * Confira na página de preços antes de decidir com base nisto: o teste mede
 * os tokens de verdade, mas o preço por token é daqui.
 */
export const PRECOS_POR_MILHAO: Record<string, { entrada: number; saida: number }> = {
  "claude-haiku-4-5": { entrada: 1, saida: 5 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10 },
  "claude-opus-5-5": { entrada: 4, saida: 20 },
};

/** O processamento em lote (resposta em até 24 horas) custa a metade. */
export const DESCONTO_DO_LOTE = 0.5;

export function custoEmDolares(
  modelo: string,
  uso: { tokensEntrada: number; tokensSaida: number },
  opcoes: { lote?: boolean } = {},
): number {
  const preco = PRECOS_POR_MILHAO[modelo];
  if (!preco) return 0;
  const total = (uso.tokensEntrada * preco.entrada + uso.tokensSaida * preco.saida) / 1_000_000;
  return opcoes.lote ? total * DESCONTO_DO_LOTE : total;
}

/** Uma estimativa grosseira de tokens de um texto em português, para o ensaio sem API. */
export function estimaTokens(texto: string): number {
  return Math.ceil(texto.length / 3.3);
}
