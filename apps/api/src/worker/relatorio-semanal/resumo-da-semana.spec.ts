import { resumoDaSemana } from "./resumo-da-semana";

describe("resumoDaSemana", () => {
  const endereco = "https://app.test/dashboard?days=7";

  it("diz o custo por cliente, compara com a semana anterior e nomeia a melhor campanha", () => {
    const resumo = resumoDaSemana(
      {
        contatos: 12,
        clientes: 3,
        gastoCentavos: 124_000,
        anterior: { contatos: 9, clientes: 1 },
        melhorCampanha: { nome: "Implante", clientes: 2, contatos: 7 },
      },
      "Clínica Sorriso",
      endereco,
    );

    expect(resumo.titulo).toBe("Sua semana: 12 contatos e 3 clientes novos");
    expect(resumo.corpo).toContain("por cliente");
    expect(resumo.corpo).toContain("Na semana anterior foram 9 contatos e 1 cliente.");
    expect(resumo.corpo).toContain("A campanha que mais trouxe foi Implante, com 2 clientes.");
    expect(resumo.texto).toContain("Clínica Sorriso");
    expect(resumo.texto).toContain(endereco);
  });

  it("no singular, sem gasto e sem campanha, não inventa frase", () => {
    const resumo = resumoDaSemana(
      { contatos: 1, clientes: 1, gastoCentavos: null, anterior: { contatos: 1, clientes: 1 }, melhorCampanha: null },
      "Loja",
      endereco,
    );

    expect(resumo.titulo).toBe("Sua semana: 1 contato e 1 cliente novo");
    expect(resumo.corpo).toBe("Igual à semana anterior.");
  });

  it("com gasto e nenhum cliente, mostra o investido sem dividir por zero", () => {
    const resumo = resumoDaSemana(
      { contatos: 0, clientes: 0, gastoCentavos: 50_000, anterior: { contatos: 2, clientes: 0 }, melhorCampanha: null },
      "Loja",
      endereco,
    );

    expect(resumo.corpo).toContain("investidos em anúncios.");
    expect(resumo.corpo).not.toContain("por cliente");
  });
});
