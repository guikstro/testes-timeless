import { AnaliseDaConversa, sanitizaAnalise, vendaSegundoAIA } from "./analise";

const base: AnaliseDaConversa = {
  situacao: "FECHADA",
  confianca: 0.9,
  valorEmCentavos: 85000,
  evidencias: ["Pode fechar"],
  motivoDaPerda: "NENHUM",
  qualidadeDoLead: "BOM",
  motivo: "Aceitou e pagou.",
};

describe("sanitizaAnalise", () => {
  it("limita a confiança entre 0 e 1", () => {
    expect(sanitizaAnalise({ ...base, confianca: 7 }).confianca).toBe(1);
    expect(sanitizaAnalise({ ...base, confianca: -3 }).confianca).toBe(0);
    expect(sanitizaAnalise({ ...base, confianca: Number.NaN }).confianca).toBe(0);
  });

  it("descarta valor negativo, fracionado ou grande demais para o banco", () => {
    expect(sanitizaAnalise({ ...base, valorEmCentavos: -1 }).valorEmCentavos).toBeNull();
    expect(sanitizaAnalise({ ...base, valorEmCentavos: 10.5 }).valorEmCentavos).toBeNull();
    expect(sanitizaAnalise({ ...base, valorEmCentavos: 2_147_483_648 }).valorEmCentavos).toBeNull();
    expect(sanitizaAnalise({ ...base, valorEmCentavos: 0 }).valorEmCentavos).toBe(0);
  });

  it("só mantém o motivo da perda quando a conversa foi perdida", () => {
    expect(sanitizaAnalise({ ...base, motivoDaPerda: "PRECO" }).motivoDaPerda).toBe("NENHUM");
    expect(sanitizaAnalise({ ...base, situacao: "PERDIDA", motivoDaPerda: "PRECO" }).motivoDaPerda).toBe("PRECO");
  });

  it("guarda no máximo 5 evidências", () => {
    expect(sanitizaAnalise({ ...base, evidencias: ["a", "b", "c", "d", "e", "f", "g"] }).evidencias).toHaveLength(5);
  });
});

describe("vendaSegundoAIA", () => {
  it("fechada e prometida são venda; o resto não", () => {
    expect(["FECHADA", "PROMETIDA"].map((s) => vendaSegundoAIA({ ...base, situacao: s as never }))).toEqual([true, true]);
    expect(["NEGOCIANDO", "PERDIDA", "SEM_VENDA"].map((s) => vendaSegundoAIA({ ...base, situacao: s as never }))).toEqual([false, false, false]);
  });
});
