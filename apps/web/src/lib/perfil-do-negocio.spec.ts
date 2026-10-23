import { centavosDe, inteiroDe, textoDosCentavos } from "./perfil-do-negocio";

describe("centavosDe", () => {
  it("lê o jeito brasileiro e o com ponto", () => {
    expect(centavosDe("1.200,50")).toBe(120_050);
    expect(centavosDe("R$ 80")).toBe(8_000);
    expect(centavosDe("1200.5")).toBe(120_050);
  });
  it("vazio é ausência, e texto solto é recusado em vez de virar zero", () => {
    expect(centavosDe("  ")).toBeNull();
    expect(centavosDe("muito")).toBe("invalido");
  });
});

describe("inteiroDe", () => {
  it("respeita o máximo", () => {
    expect(inteiroDe("35", 100)).toBe(35);
    expect(inteiroDe("150", 100)).toBe("invalido");
    expect(inteiroDe("", 100)).toBeNull();
  });
});

describe("textoDosCentavos", () => {
  it("mostra centavos só quando existem", () => {
    expect(textoDosCentavos(120_050)).toBe("1.200,50");
    expect(textoDosCentavos(8_000)).toBe("80");
    expect(textoDosCentavos(null)).toBe("");
  });
});
