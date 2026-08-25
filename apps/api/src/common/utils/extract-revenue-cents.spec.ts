import { extractRevenueCents } from "./extract-revenue-cents";

describe("extractRevenueCents", () => {
  it("parses 'R$ 2.000,00' with thousands separator and cents", () => {
    expect(extractRevenueCents("Fechamos por R$ 2.000,00")).toBe(200000);
  });

  it("parses 'R$2000' with no separator at all", () => {
    expect(extractRevenueCents("R$2000")).toBe(200000);
  });

  it("parses a small amount like 'R$50'", () => {
    expect(extractRevenueCents("R$50")).toBe(5000);
  });

  it("parses cents given as a single digit ('R$10,5' means R$10,50)", () => {
    expect(extractRevenueCents("R$10,5")).toBe(1050);
  });

  it("parses the spec's own example: 'Fechamos por 2 mil' as R$2.000,00 (200000 cents)", () => {
    expect(extractRevenueCents("Fechamos por 2 mil")).toBe(200000);
  });

  it("parses a decimal 'mil' amount", () => {
    expect(extractRevenueCents("Ficou em 1,5 mil")).toBe(150000);
  });

  it("parses '<amount> reais' with no currency sign", () => {
    expect(extractRevenueCents("combinamos 2000 reais")).toBe(200000);
  });

  it("parses '<amount> reais' with cents", () => {
    expect(extractRevenueCents("ficou 150,90 reais")).toBe(15090);
  });

  it("returns null instead of guessing when there is no identifiable value", () => {
    expect(extractRevenueCents("Fechamos o contrato, muito obrigado!")).toBeNull();
  });

  it("returns null for a bare number with no currency/unit context", () => {
    expect(extractRevenueCents("Combinamos para as 2000 horas")).toBeNull();
  });
});
