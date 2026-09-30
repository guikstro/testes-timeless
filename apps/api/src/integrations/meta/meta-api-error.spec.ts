import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { MetaApiError, explicaErroDaMeta } from "./meta-api-error";
import { ConnectMetaDto } from "./dto/connect-meta.dto";

describe("explicaErroDaMeta", () => {
  it("diz que o bloqueio é da Meta e o que conferir, sem perder a mensagem original", () => {
    const texto = explicaErroDaMeta(new MetaApiError(200, undefined, "API access blocked."));
    expect(texto).toContain("A Meta bloqueou o acesso do app à API");
    expect(texto).toContain("developers.facebook.com");
    expect(texto).toContain("(Meta: API access blocked.)");
  });

  it("token vencido pede um token novo", () => {
    expect(explicaErroDaMeta(new MetaApiError(190, 463, "Error validating access token"))).toMatch(/^O token não vale mais/);
  });

  it("conta que o token não enxerga pede para conferir o número e a atribuição", () => {
    const erro = new MetaApiError(100, 33, "Unsupported get request. Object with ID 'act_1' does not exist");
    expect(explicaErroDaMeta(erro, "act_1")).toContain("não encontrou act_1");
  });

  it("falta de permissão fala de ads_read", () => {
    expect(explicaErroDaMeta(new MetaApiError(200, undefined, "(#200) Requires ads_read permission"))).toContain("ads_read");
    expect(explicaErroDaMeta(new MetaApiError(10, undefined, "Permission denied"))).toContain("ads_read");
  });

  /*
    O limite de uso deixava a conta parada em "última sincronização: nunca",
    sem nada escrito. O texto diz que é passageiro e qual é a saída quando
    não passa, que é o acesso padrão da API de Marketing.
  */
  it("limite de uso diz que espera o bloqueio e como subir o limite", () => {
    const texto = explicaErroDaMeta(new MetaApiError(17, undefined, "(#17) User request limit reached"));
    expect(texto).toContain("A Meta bloqueou as chamadas desta conta por alguns minutos");
    expect(texto).toContain("Marketing API Access Tier");
    expect(texto).toContain("(Meta: (#17) User request limit reached)");
  });

  it("reconhece o limite por conta de anúncios da API de Marketing", () => {
    expect(new MetaApiError(80004, undefined, "There have been too many calls to this ad-account.").isRateLimited).toBe(true);
    expect(new MetaApiError(80000, undefined, "Too many calls").isRateLimited).toBe(true);
    expect(new MetaApiError(100, 33, "does not exist").isRateLimited).toBe(false);
  });

  it("erro que não conhece passa como veio", () => {
    expect(explicaErroDaMeta(new MetaApiError(1, undefined, "An unknown error occurred"))).toBe("An unknown error occurred");
  });
});

describe("ConnectMetaDto", () => {
  const conta = (adAccountId: string) => {
    const dto = plainToInstance(ConnectMetaDto, { adAccountId, accessToken: "x" });
    return { valor: dto.adAccountId, erros: validateSync(dto).length };
  };

  it("aceita o número sem act_ e completa", () => {
    expect(conta(" 1347357966590115 ")).toEqual({ valor: "act_1347357966590115", erros: 0 });
  });

  it("mantém quem já digitou com act_", () => {
    expect(conta("act_1347357966590115")).toEqual({ valor: "act_1347357966590115", erros: 0 });
  });

  it("recusa o que não é conta de anúncios", () => {
    expect(conta("https://adsmanager.facebook.com").erros).toBe(1);
  });
});
