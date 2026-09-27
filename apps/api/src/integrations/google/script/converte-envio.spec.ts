import { contaLegivel, converteCampanha, microsParaCentavos } from "./converte-envio";

const dia = (data: string, custoMicros: number) => ({
  data,
  custoMicros,
  impressoes: 100,
  cliques: 10,
  conversoes: 1.333333,
  valorConversoes: 250.5,
});

describe("converteCampanha", () => {
  it("passa dinheiro de micros para centavos, sem ponto flutuante", () => {
    expect(microsParaCentavos(12_345_678)).toBe(1235);
    const c = converteCampanha({ id: "111", nome: " Busca ", status: "ENABLED", orcamentoMicros: 50_000_000, dias: [dia("2026-09-27", 7_500_000)] });
    expect(c).toMatchObject({ externalId: "111", nome: "Busca", status: "ACTIVE", orcamentoDiarioCentavos: 5000 });
    expect(c.dias[0]).toMatchObject({ spendCents: 750, impressoes: 100, cliques: 10, conversoesNaPlataforma: 1.33, valorConversoesCentavos: 25050 });
  });

  it("usa o vocabulário de status do resto do sistema", () => {
    expect(converteCampanha({ id: "1", nome: "a", status: "PAUSED", dias: [] }).status).toBe("PAUSED");
    expect(converteCampanha({ id: "1", nome: "a", status: "REMOVED", dias: [] }).status).toBe("ARCHIVED");
  });

  it("não inventa orçamento quando o Google não manda", () => {
    expect(converteCampanha({ id: "1", nome: "a", status: "ENABLED", dias: [] }).orcamentoDiarioCentavos).toBeNull();
  });

  it("guarda um dia só quando ele vem repetido, o último", () => {
    const c = converteCampanha({ id: "1", nome: "a", status: "ENABLED", dias: [dia("2026-09-27", 1_000_000), dia("2026-09-27", 2_000_000)] });
    expect(c.dias).toHaveLength(1);
    expect(c.dias[0].spendCents).toBe(200);
  });
});

describe("contaLegivel", () => {
  it("escreve o id como o Google Ads mostra", () => {
    expect(contaLegivel("1234567890")).toBe("123-456-7890");
  });
});

import { scriptDoGoogleAds } from "./script-do-google-ads";

describe("scriptDoGoogleAds", () => {
  it("sai como JavaScript válido, com o endereço e a chave dentro", () => {
    const script = scriptDoGoogleAds("https://api.exemplo.com/api/publico/google-ads/envio", 'chave"com-aspas');
    expect(() => new Function(script)).not.toThrow();
    expect(script).toContain('"https://api.exemplo.com/api/publico/google-ads/envio"');
    // Aspas na chave não quebram o script: ela entra escapada.
    expect(script).toContain('"chave\\"com-aspas"');
  });
});
