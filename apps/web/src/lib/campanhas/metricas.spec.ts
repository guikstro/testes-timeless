import {
  alterna,
  conjuntoDe,
  formataTaxa,
  leMetricas,
  metricasDoConjunto,
  rotuloDoObjetivo,
  sugereConjunto,
} from "./metricas";

describe("leMetricas", () => {
  it("lê as métricas da URL na ordem do catálogo", () => {
    expect(leMetricas("ctr,impressoes,cliques")).toEqual(["impressoes", "cliques", "ctr"]);
  });

  it("ignora o que não é métrica, e devolve null quando não sobra nada", () => {
    expect(leMetricas("ctr,<script>,cpm")).toEqual(["cpm", "ctr"]);
    expect(leMetricas("qualquer")).toBeNull();
    expect(leMetricas("")).toBeNull();
    expect(leMetricas(undefined)).toBeNull();
  });
});

describe("alterna", () => {
  it("liga e desliga mantendo a ordem do catálogo", () => {
    expect(alterna(["cliques", "ctr"], "impressoes")).toEqual(["impressoes", "cliques", "ctr"]);
    expect(alterna(["impressoes", "cliques", "ctr"], "cliques")).toEqual(["impressoes", "ctr"]);
  });

  it("não deixa a tabela sem nenhuma métrica", () => {
    expect(alterna(["ctr"], "ctr")).toEqual(["ctr"]);
  });
});

describe("conjuntos", () => {
  it("reconhece a escolha que é exatamente um conjunto pronto", () => {
    expect(conjuntoDe(metricasDoConjunto("entrega"))).toBe("entrega");
    expect(conjuntoDe(metricasDoConjunto("vendas"))).toBe("vendas");
    expect(conjuntoDe(["impressoes", "leads"])).toBeNull();
  });
});

describe("objetivo", () => {
  it("chama o objetivo como quem anuncia, inclusive pelo nome antigo da Meta", () => {
    expect(rotuloDoObjetivo("OUTCOME_TRAFFIC")).toBe("Tráfego");
    expect(rotuloDoObjetivo("LINK_CLICKS")).toBe("Tráfego");
    expect(rotuloDoObjetivo("OUTCOME_LEADS")).toBe("Cadastros");
    expect(rotuloDoObjetivo("ALGO_NOVO")).toBeNull();
    expect(rotuloDoObjetivo(null)).toBeNull();
  });

  /*
    O conjunto que importa é o da campanha onde o dinheiro está, e não o da
    campanha de teste de R$ 20.
  */
  it("sugere pelo objetivo onde está o investimento", () => {
    expect(
      sugereConjunto([
        { objetivo: "OUTCOME_ENGAGEMENT", gastoCentavos: 2_000 },
        { objetivo: "OUTCOME_TRAFFIC", gastoCentavos: 500_000 },
      ]),
    ).toEqual({ conjunto: "entrega", objetivo: "Tráfego" });
  });

  it("mensagens e cadastros sugerem conversas e leads; vendas sugere vendas", () => {
    expect(sugereConjunto([{ objetivo: "MESSAGES", gastoCentavos: 100 }]).conjunto).toBe("conversas");
    expect(sugereConjunto([{ objetivo: "OUTCOME_LEADS", gastoCentavos: 100 }]).conjunto).toBe("conversas");
    expect(sugereConjunto([{ objetivo: "OUTCOME_SALES", gastoCentavos: 100 }]).conjunto).toBe("vendas");
  });

  it("sem objetivo conhecido, fica o conjunto que a tela sempre mostrou", () => {
    expect(sugereConjunto([{ objetivo: null, gastoCentavos: 100 }])).toEqual({ conjunto: "vendas", objetivo: null });
    expect(sugereConjunto([])).toEqual({ conjunto: "vendas", objetivo: null });
  });
});

describe("formataTaxa", () => {
  it("escreve o CTR com duas casas e vírgula", () => {
    expect(formataTaxa(0.0215)).toBe("2,15%");
    expect(formataTaxa(0)).toBe("0,00%");
  });
});
