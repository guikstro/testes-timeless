import { avaliaRevisao, divergentes, leCsv, LinhaDoTeste, referencia, relatorioEmHtml, resumoDoModelo, revisaoEmCsv, AnaliseDeUmModelo } from "./relatorio";

const analise = (vendaIA: boolean | null, extra: Partial<AnaliseDeUmModelo> = {}): AnaliseDeUmModelo => ({
  situacao: vendaIA ? "FECHADA" : "SEM_VENDA",
  vendaIA,
  confianca: vendaIA === null ? null : 0.9,
  valorEmCentavos: null,
  evidencias: [],
  citacoesInvalidas: 0,
  motivoDaPerda: "NENHUM",
  qualidadeDoLead: "BOM",
  motivo: "ok",
  tokensEntrada: 500,
  tokensSaida: 100,
  ms: 1000,
  custo: 0.002,
  ...extra,
});

const linha = (id: string, humano: LinhaDoTeste["humano"], sistema: LinhaDoTeste["sistema"], ia: boolean | null, extra: Partial<AnaliseDeUmModelo> = {}): LinhaDoTeste => ({
  id,
  organizacao: "Org <A>",
  mensagens: 10,
  omitidas: 0,
  midias: 0,
  humano,
  sistema,
  transcricao: "[10:00] Cliente: oi <b>",
  porModelo: { sonnet: analise(ia, extra) },
});

const linhas = [
  linha("a", "VENDA", "VENDA", true), // pessoa disse venda, IA achou
  linha("b", "VENDA", "VENDA", false), // IA perdeu uma venda confirmada
  linha("c", "SEM_VENDA", "SEM_VENDA", true), // IA viu venda onde pessoa disse que não
  linha("d", null, "VENDA", false), // regra detectou, IA discorda
  linha("e", null, "VENDA", true), // regra detectou, IA concorda
  linha("f", null, "SEM_VENDA", true), // IA vê venda que o sistema perdeu
  linha("g", null, "SEM_VENDA", false), // todos concordam
  linha("h", null, "SEM_VENDA", null, { erro: "429" }), // erro
];

describe("resumoDoModelo", () => {
  const r = resumoDoModelo(linhas, "sonnet");

  it("conta contra o que pessoas decidiram", () => {
    expect(r.contraPessoas).toEqual({ vendasConfirmadas: 2, iaEncontrou: 1, semVendaDecidida: 1, iaDisseVenda: 1 });
  });

  it("conta contra a regra de palavras", () => {
    expect(r.contraSistema).toEqual({ regraSemConfirmacao: 2, iaConcorda: 1, semVendaNoSistema: 2, iaVeVendaPerdida: 1 });
  });

  it("mede custo e tokens só das respostas boas, e conta os erros", () => {
    expect(r.analisadas).toBe(8);
    expect(r.erros).toBe(1);
    expect(r.tokensEntradaMedio).toBe(500);
    expect(r.custoTotal).toBeCloseTo(0.016, 6);
    expect(r.custoPorMil).toBeCloseTo(2, 6);
  });
});

describe("referencia e divergentes", () => {
  it("pessoa vale mais que o sistema", () => {
    expect(referencia(linha("x", "SEM_VENDA", "VENDA", true))).toEqual({ valor: "SEM_VENDA", origem: "pessoa" });
    expect(referencia(linha("x", null, "VENDA", true))).toEqual({ valor: "VENDA", origem: "sistema" });
  });

  it("lista só onde a IA discorda, com as decididas por pessoas primeiro", () => {
    expect(divergentes(linhas, ["sonnet"]).map((l) => l.id)).toEqual(["b", "c", "d", "f"]);
  });
});

describe("planilha de revisão", () => {
  it("vai e volta, com vírgula, aspas e quebra de linha dentro do campo", () => {
    const l = linha("x", null, "VENDA", false, { evidencias: ['disse "fechado", ok'], valorEmCentavos: 85000 });
    const csv = revisaoEmCsv([l], ["sonnet"]);
    const lido = leCsv(csv);
    expect(lido[0]).toEqual(["id", "organizacao", "referencia", "origem_da_referencia", "ia_sonnet", "valor_ia", "evidencias_ia", "verdade"]);
    expect(lido[1][0]).toBe("x");
    expect(lido[1][1]).toBe("Org <A>");
    expect(lido[1][5]).toBe("850,00");
    expect(lido[1][6]).toBe('disse "fechado", ok');
    expect(lido[1][7]).toBe("");
  });

  it("avalia quem acertou, só nas conversas que a pessoa julgou", () => {
    const csv = [
      "id,verdade",
      "b,VENDA", // IA errou (disse sem venda), referência acertou
      "c,SEM_VENDA", // IA errou (disse venda), referência acertou
      "d,SEM_VENDA", // IA acertou, a referência (regra) errou
      "f,venda", // IA acertou, a referência errou (minúscula também vale)
      "e,", // não julgada
    ].join("\n");
    const r = avaliaRevisao(linhas, ["sonnet"], leCsv(csv));
    expect(r.julgadas).toBe(4);
    expect(r.referenciaAcertou).toBe(2);
    expect(r.porModelo[0]).toEqual({ modelo: "sonnet", acertou: 2, vendasReais: 2, vendasAcertadas: 1, falsasVendas: 1 });
  });
});

describe("relatorioEmHtml", () => {
  it("escapa HTML da conversa e traz custo, comparações e divergências", () => {
    const html = relatorioEmHtml({ linhas, modelos: ["sonnet"], geradoEm: new Date("2026-10-08T12:00:00Z") });
    expect(html).toContain("&lt;b&gt;");
    expect(html).not.toContain("<b>oi");
    expect(html).toContain("Org &lt;A&gt;");
    expect(html).toContain("Custo por 1.000");
    expect(html).toContain("1 de 2 (50%)");
    expect(html).toContain("<code>c</code>");
    expect(html).not.toContain("—");
  });

  it("sem divergência, diz isso", () => {
    const html = relatorioEmHtml({ linhas: [linha("g", null, "SEM_VENDA", false)], modelos: ["sonnet"], geradoEm: new Date() });
    expect(html).toContain("Nenhuma divergência.");
  });
});
