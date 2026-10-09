import { derivaGabarito } from "./gabarito";

const venda = (status: string, confirmationSource: string, deletedAt: Date | null = null) => ({ status, confirmationSource, deletedAt });

describe("derivaGabarito", () => {
  it("venda confirmada à mão, por CRM ou API é a resposta certa", () => {
    expect(derivaGabarito({ disqualifiedAt: null, sales: [venda("CONFIRMED", "MANUAL")] })).toEqual({ humano: "VENDA", sistema: "VENDA" });
    expect(derivaGabarito({ disqualifiedAt: null, sales: [venda("CONFIRMED", "CRM")] }).humano).toBe("VENDA");
  });

  it("venda só da conversa (a regra de palavras) NÃO é resposta certa: é o que o teste julga", () => {
    expect(derivaGabarito({ disqualifiedAt: null, sales: [venda("CONFIRMED", "CONVERSATION")] })).toEqual({ humano: null, sistema: "VENDA" });
  });

  it("venda rejeitada ou lead descartado à mão é 'sem venda' decidido por pessoa", () => {
    expect(derivaGabarito({ disqualifiedAt: null, sales: [venda("REJECTED", "CONVERSATION")] })).toEqual({ humano: "SEM_VENDA", sistema: "SEM_VENDA" });
    expect(derivaGabarito({ disqualifiedAt: new Date(), sales: [] })).toEqual({ humano: "SEM_VENDA", sistema: "SEM_VENDA" });
  });

  it("sem nada, ninguém decidiu", () => {
    expect(derivaGabarito({ disqualifiedAt: null, sales: [] })).toEqual({ humano: null, sistema: "SEM_VENDA" });
  });

  it("venda apagada não conta", () => {
    expect(derivaGabarito({ disqualifiedAt: null, sales: [venda("CONFIRMED", "MANUAL", new Date())] })).toEqual({ humano: null, sistema: "SEM_VENDA" });
  });

  it("venda cancelada deixa de ser venda no sistema", () => {
    expect(derivaGabarito({ disqualifiedAt: null, sales: [venda("CANCELLED", "MANUAL")] }).sistema).toBe("SEM_VENDA");
  });
});
