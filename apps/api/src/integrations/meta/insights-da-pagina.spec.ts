import { MetaApiError } from "./meta-api-error";
import { diaDoValor, explicaErroDaPagina, linhasDosInsights } from "./insights-da-pagina";

describe("diaDoValor", () => {
  /*
    A Meta marca o valor do dia 1º com a virada do dia 2, no fuso da Página.
    O dia certo precisa sair igual para uma Página em Brasília, na Califórnia
    ou em Lisboa, sem saber qual é o fuso dela.
  */
  it("devolve o dia a que o valor se refere, em qualquer fuso", () => {
    expect(diaDoValor("2026-09-02T03:00:00+0000")).toBe("2026-09-01");
    expect(diaDoValor("2026-09-02T07:00:00+0000")).toBe("2026-09-01");
    expect(diaDoValor("2026-09-01T23:00:00+0000")).toBe("2026-09-01");
  });

  it("não inventa dia para uma data que não é data", () => {
    expect(diaDoValor("ontem")).toBeNull();
  });
});

describe("linhasDosInsights", () => {
  it("vira uma linha por métrica e por dia", () => {
    const linhas = linhasDosInsights([
      {
        name: "page_media_view",
        period: "day",
        values: [
          { value: 1200, end_time: "2026-09-02T07:00:00+0000" },
          { value: 900, end_time: "2026-09-03T07:00:00+0000" },
        ],
      },
    ]);
    expect(linhas).toEqual([
      { metrica: "page_media_view", dia: "2026-09-01", valor: 1200 },
      { metrica: "page_media_view", dia: "2026-09-02", valor: 900 },
    ]);
  });

  it("guarda o período no nome quando pedido, para os visualizadores de 7 e 28 dias", () => {
    const [linha] = linhasDosInsights(
      [{ name: "page_total_media_view_unique", period: "days_28", values: [{ value: 209765, end_time: "2026-09-30T07:00:00+0000" }] }],
      "days_28",
    );
    expect(linha.metrica).toBe("page_total_media_view_unique:days_28");
  });

  it("deixa de fora o valor quebrado por categoria e o valor sem data", () => {
    expect(
      linhasDosInsights([
        { name: "x", period: "day", values: [{ value: { a: 1 }, end_time: "2026-09-02T07:00:00+0000" }, { value: 3 }] },
      ]),
    ).toEqual([]);
  });
});

describe("explicaErroDaPagina", () => {
  it("falta de permissão diz quais permissões e onde a Página precisa estar", () => {
    const texto = explicaErroDaPagina(new MetaApiError(200, undefined, "(#200) Requires read_insights permission"));
    expect(texto).toContain("pages_read_engagement");
    expect(texto).toContain("read_insights");
    expect(texto).toContain("(Meta: (#200) Requires read_insights permission)");
  });

  it("Página que não existe ou que o usuário do sistema não enxerga", () => {
    expect(explicaErroDaPagina(new MetaApiError(100, 33, "Object with ID '1' does not exist"))).toContain(
      "não encontrou a Página",
    );
  });

  it("limite de uso diz que tenta de novo sozinho", () => {
    expect(explicaErroDaPagina(new MetaApiError(32, undefined, "Page request limit reached"))).toContain(
      "tenta de novo sozinho",
    );
  });

  it("erro que não vem da Meta passa como veio", () => {
    expect(explicaErroDaPagina(new Error("rede fora"))).toBe("rede fora");
  });
});
