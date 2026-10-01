import { comecaAntes, coberturaDeTodas, diasAntes } from "./cobertura";

describe("cobertura", () => {
  /*
    O caso da Doca: o script começou no fim de setembro e mandou 35 dias para
    trás. Agosto começa antes do primeiro dado: a variação contra ele não vale.
  */
  it("um período que começa antes do primeiro dado é parcial", () => {
    expect(comecaAntes({ de: "2026-08-01" }, "2026-08-26")).toBe(true);
    expect(comecaAntes({ de: "2026-09-01" }, "2026-08-26")).toBe(false);
    expect(comecaAntes({ de: "2026-08-26" }, "2026-08-26")).toBe(false);
  });

  it("sem cobertura conhecida ou sem período, não afirma nada", () => {
    expect(comecaAntes({ de: "2026-08-01" }, null)).toBe(false);
    expect(comecaAntes(null, "2026-08-26")).toBe(false);
  });

  it("várias fontes: vale a mais recente, e a desconhecida não restringe", () => {
    expect(coberturaDeTodas(["2026-07-01", "2026-09-23", null])).toBe("2026-09-23");
    expect(coberturaDeTodas([null, null])).toBeNull();
  });

  it("conta dias para trás sem errar a virada de mês", () => {
    expect(diasAntes("2026-09-03", 7)).toBe("2026-08-27");
  });
});
