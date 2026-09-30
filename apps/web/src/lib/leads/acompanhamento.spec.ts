import { centavosDoTexto, situacaoDaProximaAcao, textoDosCentavos } from "./acompanhamento";

describe("acompanhamento do lead", () => {
  it("lê reais como se escreve no Brasil", () => {
    expect(centavosDoTexto("1.500")).toBe(150_000);
    expect(centavosDoTexto("1.500,00")).toBe(150_000);
    expect(centavosDoTexto("R$ 1.500,50")).toBe(150_050);
    expect(centavosDoTexto("1500")).toBe(150_000);
    expect(centavosDoTexto("1500,5")).toBe(150_050);
    expect(centavosDoTexto("12.345.678")).toBe(1_234_567_800);
  });

  it("vazio limpa; texto que não é número é recusado", () => {
    expect(centavosDoTexto("")).toBeNull();
    expect(centavosDoTexto("   ")).toBeNull();
    expect(centavosDoTexto("mil reais")).toBeUndefined();
    expect(centavosDoTexto("-10")).toBeUndefined();
    expect(centavosDoTexto("1,2,3")).toBeUndefined();
  });

  it("escreve os centavos de volta no formato do campo", () => {
    expect(textoDosCentavos(150_050).replace(/ /g, " ")).toBe("1.500,50");
    expect(textoDosCentavos(null)).toBe("");
  });

  it("compara a próxima ação como dia, e não como instante", () => {
    expect(situacaoDaProximaAcao("2026-10-01T00:00:00.000Z", "2026-10-02")).toBe("atrasada");
    expect(situacaoDaProximaAcao("2026-10-02T00:00:00.000Z", "2026-10-02")).toBe("hoje");
    expect(situacaoDaProximaAcao("2026-10-03", "2026-10-02")).toBe("futura");
    expect(situacaoDaProximaAcao(null, "2026-10-02")).toBeNull();
  });
});
