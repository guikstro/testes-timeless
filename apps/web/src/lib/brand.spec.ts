import { brandPalette, brandPaletteEscura } from "./brand";

const luminancia = (triplo: string) => {
  const [r, g, b] = triplo.split(" ").map((canal) => {
    const c = Number(canal) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contraste = (a: string, b: string) => {
  const [clara, escura] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (clara + 0.05) / (escura + 0.05);
};

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

describe("brandPaletteEscura", () => {
  it("sem cor escolhida, usa o passo escuro da Timeless medido nas artes", () => {
    expect(brandPaletteEscura(null)).toMatchObject({
      accent: "0 168 123",
      soft: "10 38 30",
      ink: "108 226 184",
      accentContrast: "3 4 3",
    });
    // O verde da Timeless escolhido à mão é o mesmo caso.
    expect(brandPaletteEscura("#007D5E")).toEqual(brandPaletteEscura(null));
  });

  it("clareia a cor até ler sobre o fundo escuro", () => {
    const p = brandPaletteEscura("#1E3A8A");
    expect(contraste(p.accent, "3 4 3")).toBeGreaterThanOrEqual(6);
    expect(p.accent).not.toBe(brandPalette("#1E3A8A").accent);
  });

  it("o fundo suave é escuro e a tinta sobre ele é clara", () => {
    const p = brandPaletteEscura("#7C3AED");
    expect(luminancia(p.soft)).toBeLessThan(0.05);
    expect(contraste(p.ink, p.soft)).toBeGreaterThanOrEqual(4.5);
  });

  it("o texto sobre o acento é o de maior contraste", () => {
    const p = brandPaletteEscura("#FACC15");
    expect(p.accentContrast).toBe("3 4 3");
  });

  it("as séries do gráfico são as mesmas do tema claro", () => {
    expect(brandPaletteEscura("#0F766E").serie2).toBe(brandPalette("#0F766E").serie2);
    expect(brandPaletteEscura(null).serie1).toBe(brandPalette(null).serie1);
  });
});
