import { podeVer, telaInicial } from "./areas";

describe("podeVer", () => {
  const soLeads = ["leads", "conversas"];

  it("sem limite, abre tudo", () => {
    expect(podeVer(null, "/integrations/whatsapp")).toBe(true);
  });

  it("confere também o que fica dentro da área", () => {
    expect(podeVer(soLeads, "/leads")).toBe(true);
    expect(podeVer(soLeads, "/leads/abc")).toBe(true);
    expect(podeVer(soLeads, "/integrations/whatsapp")).toBe(false);
    expect(podeVer(soLeads, "/campanhas")).toBe(false);
  });

  it("não confunde o relatório com o relatório geral", () => {
    expect(podeVer(["relatorio"], "/relatorio-geral")).toBe(true);
    expect(podeVer(["leads"], "/relatorio")).toBe(false);
  });

  it("configurações e o que não é área abrem sempre", () => {
    expect(podeVer(soLeads, "/settings")).toBe(true);
    expect(podeVer(soLeads, "/notifications")).toBe(true);
  });
});

describe("telaInicial", () => {
  it("é a primeira área liberada", () => {
    expect(telaInicial(["links", "leads"])).toBe("/leads");
    expect(telaInicial(null)).toBe("/dashboard");
  });
});
