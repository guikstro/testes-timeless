import { focoMostra, temLeads, temPresencaLocal } from "./foco";
import { telaInicial } from "./areas";

describe("foco do cliente", () => {
  it("presença local tira do caminho o que é de lead", () => {
    expect(focoMostra("PRESENCA_LOCAL", "/conversas")).toBe(false);
    expect(focoMostra("PRESENCA_LOCAL", "/leads/abc")).toBe(false);
    expect(focoMostra("PRESENCA_LOCAL", "/links")).toBe(false);
    expect(focoMostra("PRESENCA_LOCAL", "/dashboard")).toBe(true);
    expect(focoMostra("PRESENCA_LOCAL", "/integrations/google")).toBe(true);
    expect(focoMostra("PRESENCA_LOCAL", "/integrations/whatsapp")).toBe(false);
    expect(focoMostra("PRESENCA_LOCAL", "/integrations")).toBe(true);
  });

  it("leads e os dois mostram tudo", () => {
    expect(focoMostra("LEADS", "/conversas")).toBe(true);
    expect(focoMostra("AMBOS", "/leads")).toBe(true);
    expect(focoMostra(undefined, "/leads")).toBe(true);
  });

  it("quem tem o quê", () => {
    expect([temLeads("LEADS"), temPresencaLocal("LEADS")]).toEqual([true, false]);
    expect([temLeads("PRESENCA_LOCAL"), temPresencaLocal("PRESENCA_LOCAL")]).toEqual([false, true]);
    expect([temLeads("AMBOS"), temPresencaLocal("AMBOS")]).toEqual([true, true]);
  });

  it("a tela inicial pula o que o foco esconde", () => {
    expect(telaInicial(["conversas", "leads", "campanhas"], "PRESENCA_LOCAL")).toBe("/campanhas");
    expect(telaInicial(["conversas", "campanhas"], "LEADS")).toBe("/conversas");
  });
});
