import { custoEmDolares, estimaTokens, MODELOS } from "./custo";

describe("custoEmDolares", () => {
  const uso = { tokensEntrada: 1_000_000, tokensSaida: 100_000 };

  it("usa o preço de entrada e de saída de cada modelo", () => {
    expect(custoEmDolares(MODELOS.haiku, uso)).toBeCloseTo(1.5, 6);
    expect(custoEmDolares(MODELOS.sonnet, uso)).toBeCloseTo(3, 6);
    expect(custoEmDolares(MODELOS.opus, uso)).toBeCloseTo(6, 6);
  });

  it("o lote custa a metade", () => {
    expect(custoEmDolares(MODELOS.sonnet, uso, { lote: true })).toBeCloseTo(1.5, 6);
  });

  it("modelo fora da tabela custa zero em vez de inventar preço", () => {
    expect(custoEmDolares("claude-desconhecido", uso)).toBe(0);
  });

  it("estima tokens por tamanho do texto", () => {
    expect(estimaTokens("a".repeat(330))).toBe(100);
  });
});
