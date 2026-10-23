import { NumerosDaCampanha, objetivoDoTrabalho, resultadoDaCampanha } from "./resultado";

const base: NumerosDaCampanha = {
  plataforma: "META",
  gastoCentavos: 40_000,
  impressoes: 12_000,
  cliques: 300,
  visualizacoesDeVideo: null,
  conversasNaPlataforma: null,
  leads: 0,
  vendas: 0,
  receitaCentavos: 0,
  vendasSemValor: 0,
  diasAtivos: 20,
};

describe("objetivoDoTrabalho", () => {
  it("separa vendas, presença local e audiência", () => {
    expect(objetivoDoTrabalho("cliente")).toBe("vendas");
    expect(objetivoDoTrabalho("whatsapp")).toBe("vendas");
    expect(objetivoDoTrabalho("loja")).toBe("local");
    expect(objetivoDoTrabalho("visto")).toBe("audiencia");
  });
});

describe("resultadoDaCampanha", () => {
  it("vendas: mostra a venda confirmada, a receita e o custo por venda", () => {
    const r = resultadoDaCampanha("vendas", { ...base, leads: 6, vendas: 2, receitaCentavos: 80_000 }, { medido: true });
    expect(r.valor).toBe(2);
    expect(r.unidade).toEqual(["venda confirmada", "vendas confirmadas"]);
    expect(r.detalhe).toContain("de receita atribuída");
    expect(r.custoCentavos).toBe(20_000);
    expect(r.conclusao?.tom).toBe("bom");
  });

  it("vendas sem o WhatsApp recebendo: só o que a plataforma contou, sem conclusão", () => {
    const r = resultadoDaCampanha("vendas", { ...base, conversasNaPlataforma: 14 }, { medido: false });
    expect(r.valor).toBe(14);
    expect(r.unidade[1]).toBe("conversas abertas");
    expect(r.detalhe).toBe("Contado pela Meta");
    expect(r.conclusao).toBeNull();
  });

  it("campanha recente não é chamada de ruim: o que falta é amostra", () => {
    const r = resultadoDaCampanha("vendas", { ...base, diasAtivos: 2 }, { medido: true });
    expect(r.conclusao).toEqual({ texto: "Ainda com pouca amostra", tom: "neutro" });
    expect(r.atencao).toBe(0);
  });

  it("conversa aberta que não chegou como contato aponta para o rastreio, como atenção", () => {
    const r = resultadoDaCampanha("vendas", { ...base, conversasNaPlataforma: 9 }, { medido: true });
    expect(r.conclusao?.tom).toBe("atencao");
  });

  it("gasto maduro sem contato e sem conversa é o que pede atenção primeiro", () => {
    const r = resultadoDaCampanha("vendas", base, { medido: true });
    expect(r.conclusao).toEqual({ texto: "Gastando sem contato", tom: "ruim" });
    expect(r.atencao).toBe(3);
  });

  it("presença local: não soma rota com ligação", () => {
    const r = resultadoDaCampanha("local", { ...base, plataforma: "GOOGLE" }, { medido: true, loja: { rotas: 14, ligacoes: 3 } });
    expect(r.valor).toBe(14);
    expect(r.unidade[1]).toBe("pedidos de rota");
    expect(r.detalhe).toContain("3 cliques para ligar");
    expect(r.detalhe).toContain("Visitas à loja não medidas");
  });

  it("presença local sem medida não vira zero", () => {
    const r = resultadoDaCampanha("local", base, { medido: true, loja: null });
    expect(r.valor).toBeNull();
  });

  it("audiência: visualizações com a fonte, e nunca julgada por venda", () => {
    const r = resultadoDaCampanha("audiencia", { ...base, visualizacoesDeVideo: 4_800 }, { medido: true });
    expect(r.valor).toBe(4_800);
    expect(r.unidade[1]).toBe("visualizações");
    expect(r.conclusao).toBeNull();
  });
});
