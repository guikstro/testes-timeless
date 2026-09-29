import { erroLegivel } from "./erro-da-api";

describe("erro da API em palavras de gente", () => {
  it("troca o 'Cannot PUT /api/...' do Express por uma frase em português", () => {
    const erro = erroLegivel({ code: "NOT_FOUND", message: "Cannot PUT /api/admin/organizations/1/foco" }, 404);
    expect(erro.code).toBe("ROTA_INEXISTENTE");
    expect(erro.message).not.toContain("Cannot");
  });

  it("mantém o erro que a API escreveu", () => {
    const corpo = { code: "NOT_FOUND", message: "Lead não encontrado." };
    expect(erroLegivel(corpo, 404)).toBe(corpo);
    expect(erroLegivel({ code: "FORBIDDEN", message: "Cannot PUT /x" }, 403).code).toBe("FORBIDDEN");
  });

  it("sem corpo, diz que não sabe", () => {
    expect(erroLegivel(null, 500)).toEqual({ code: "UNKNOWN", message: "Erro desconhecido." });
  });
});
