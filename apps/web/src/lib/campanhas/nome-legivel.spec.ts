import { nomeLegivelDaCampanha } from "./nome-legivel";

describe("nomeLegivelDaCampanha", () => {
  it("tira a marca, a sigla do cliente e o tipo, e deixa tese e mês", () => {
    expect(nomeLegivelDaCampanha("[TMLS] QZB - PESQUISA - RESCISÃO - NOVEMBRO")).toBe("Rescisão · Novembro");
    expect(nomeLegivelDaCampanha("[TMLS] QZB - PESQUISA - INSALUBRIDADE - OUTUBRO")).toBe("Insalubridade · Outubro");
  });

  it("deixa como veio o que não segue o padrão", () => {
    expect(nomeLegivelDaCampanha("[NOVA] [SEARCH] [LP TRABALHISTA]")).toBe("[NOVA] [SEARCH] [LP TRABALHISTA]");
    expect(nomeLegivelDaCampanha("FEVEREIRO/2026 [NOVA] ADV+ | WPP")).toBe("FEVEREIRO/2026 [NOVA] ADV+ | WPP");
    expect(nomeLegivelDaCampanha("Promoção de verão")).toBe("Promoção de verão");
  });

  it("não deixa o nome vazio", () => {
    expect(nomeLegivelDaCampanha("[TMLS] QZB - PESQUISA")).toBe("[TMLS] QZB - PESQUISA");
  });
});
