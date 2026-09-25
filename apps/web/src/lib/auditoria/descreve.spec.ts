import { descreveRegistro, destinoDoRegistro } from "./descreve";

const r = (action: string, before: unknown = null, after: unknown = null, entity = "User") => ({
  action,
  entity,
  before,
  after,
});

describe("descreveRegistro", () => {
  it("escreve as ações de acesso em português", () => {
    expect(descreveRegistro(r("LOGIN_SUCCEEDED", null, { segundoFator: true }))).toBe(
      "Entrou, com verificação em duas etapas",
    );
    expect(descreveRegistro(r("LOGIN_FAILED", null, { motivo: "senha incorreta" }))).toBe(
      "Tentativa de entrada recusada: senha incorreta",
    );
    expect(descreveRegistro(r("SESSIONS_ENDED", null, { encerradas: 3, todasAsOutras: true }))).toBe(
      "Encerrou as sessões de 3 outros aparelhos",
    );
  });

  it("diz quem foi afetado numa mudança de equipe", () => {
    expect(
      descreveRegistro(r("MEMBER_ROLE_CHANGED", { role: "MEMBER", nome: "Bia" }, { role: "ADMIN" })),
    ).toBe("Mudou o papel de Bia de Membro para Administrador");
    expect(descreveRegistro(r("MEMBER_REMOVED", { role: "MEMBER", nome: "Bia" }))).toBe("Removeu Bia da equipe");
  });

  it("escreve dinheiro em reais, e não em centavos", () => {
    const texto = descreveRegistro(
      r("AD_BUDGET_CHANGED", { nome: "Conjunto A", valor: "5000" }, { nome: "Conjunto A", valor: "8000" }, "Conjunto de anúncios"),
    );
    expect(texto).toContain("R$");
    expect(texto).toContain("50,00");
    expect(texto).toContain("80,00");
  });

  it("diz qual anúncio foi pausado", () => {
    expect(
      descreveRegistro(r("AD_STATUS_CHANGED", { nome: "Vídeo 01", valor: "ACTIVE" }, { nome: "Vídeo 01", valor: "PAUSED" }, "Anúncio")),
    ).toBe("Pausou o anúncio “Vídeo 01”");
  });

  it("lista os campos das configurações que mudaram, pelo nome da tela", () => {
    expect(descreveRegistro(r("ORGANIZATION_UPDATED", { name: "A", brandColor: null }, { name: "B", brandColor: "#000" }))).toBe(
      "Alterou as configurações: nome, cor",
    );
    expect(descreveRegistro(r("ORGANIZATION_UPDATED", { logoUrl: "x" }, { logoUrl: null }))).toBe("Removeu a logo");
  });

  it("não quebra com um registro sem estado", () => {
    expect(descreveRegistro(r("SALE_CREATED"))).toBe("Registrou uma venda de valor não informado");
    expect(descreveRegistro(r("ACAO_NOVA"))).toBe("ACAO_NOVA");
  });
});

describe("destinoDoRegistro", () => {
  it("leva ao lead quando o registro é de um lead", () => {
    expect(destinoDoRegistro({ entity: "Lead", entityId: "abc" })).toBe("/leads/abc");
    expect(destinoDoRegistro({ entity: "User", entityId: "abc" })).toBeNull();
  });
});
