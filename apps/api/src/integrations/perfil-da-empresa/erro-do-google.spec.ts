import { erroDaResposta, explicaErroDoGoogle } from "./erro-do-google";

describe("as recusas do Google, em português", () => {
  it("lê os dois formatos de erro: o das APIs e o do OAuth", () => {
    expect(erroDaResposta(403, { error: { code: 403, message: "The caller does not have permission", status: "PERMISSION_DENIED" } })).toMatchObject({
      status: 403,
      codigo: "PERMISSION_DENIED",
      message: "The caller does not have permission",
    });
    const oauth = erroDaResposta(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
    expect(oauth).toMatchObject({ codigo: "invalid_grant", message: "Token has been expired or revoked." });
    expect(oauth.acessoPerdido).toBe(true);
    expect(erroDaResposta(500, null).message).toBe("O Google respondeu 500.");
  });

  it("cada recusa diz o próximo passo, sem mandar ler arquivo do repositório", () => {
    const casos = [
      [erroDaResposta(400, { error: "invalid_grant", error_description: "x" }), "Conecte de novo"],
      [erroDaResposta(429, { error: { message: "Quota exceeded", status: "RESOURCE_EXHAUSTED" } }), "cota é zero"],
      [erroDaResposta(403, { error: { message: "API has not been used in project 123 before or it is disabled", status: "PERMISSION_DENIED" } }), "Business Profile Performance API"],
      [erroDaResposta(403, { error: { message: "The caller does not have permission", status: "PERMISSION_DENIED" } }), "convite de gerente"],
      [erroDaResposta(404, { error: { message: "Requested entity was not found.", status: "NOT_FOUND" } }), "removido ou transferido"],
    ] as const;
    for (const [erro, trecho] of casos) {
      const texto = explicaErroDoGoogle(erro);
      expect(texto).toContain(trecho);
      expect(texto).not.toContain("docs/");
    }
  });
});
