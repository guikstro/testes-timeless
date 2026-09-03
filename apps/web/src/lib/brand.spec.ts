import { brandPalette } from "./brand";

describe("brandPalette", () => {
  it("usa o verde da Timeless quando a organização não escolheu cor", () => {
    expect(brandPalette(null).accent).toBe("0 125 94");
  });

  it("faz o acento e a primeira série serem a cor escolhida", () => {
    const p = brandPalette("#7C3AED");
    expect(p.accent).toBe("124 58 237");
    expect(p.serie1).toBe("124 58 237");
  });

  it("escreve em preto sobre cor clara e em branco sobre cor escura", () => {
    // Branco sobre amarelo cai abaixo do contraste mínimo e o texto some, que
    // é o defeito que este cálculo existe para evitar.
    expect(brandPalette("#FACC15").accentContrast).toBe("3 4 3");
    expect(brandPalette("#1E3A8A").accentContrast).toBe("255 255 255");
  });

  it("separa a segunda série da primeira em tom e em claridade", () => {
    const p = brandPalette("#0F766E");
    const [r1, g1, b1] = p.serie1.split(" ").map(Number);
    const [r2, g2, b2] = p.serie2.split(" ").map(Number);

    // Distância grande o suficiente para não haver dúvida entre as duas
    // linhas do gráfico.
    const distancia = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
    expect(distancia).toBeGreaterThan(90);
  });

  it("ignora um hex inválido em vez de pintar a tela de preto", () => {
    expect(brandPalette("nao-e-cor")).toEqual(brandPalette(null));
    expect(brandPalette("#12")).toEqual(brandPalette(null));
  });

  it("aceita a forma curta de três dígitos", () => {
    expect(brandPalette("#0a5").accent).toBe(brandPalette("#00aa55").accent);
  });
});
