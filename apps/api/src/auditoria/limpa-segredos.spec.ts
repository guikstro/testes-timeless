import { limpaSegredos, OMITIDO } from "./limpa-segredos";

describe("limpaSegredos", () => {
  it("omite senha, token, segredo e hash pelo nome do campo", () => {
    expect(
      limpaSegredos({
        nome: "Ana",
        passwordHash: "$2b$10$x",
        accessToken: "EAAB...",
        capiAccessTokenEncrypted: "iv:tag:ct",
        segredo: "JBSWY3DP",
        apiKey: "k",
      }),
    ).toEqual({
      nome: "Ana",
      passwordHash: OMITIDO,
      accessToken: OMITIDO,
      capiAccessTokenEncrypted: OMITIDO,
      segredo: OMITIDO,
      apiKey: OMITIDO,
    });
  });

  it("desce em objetos e listas", () => {
    expect(limpaSegredos({ conexao: { refreshToken: "r", status: "ok" }, itens: [{ senha: "1" }] })).toEqual({
      conexao: { refreshToken: OMITIDO, status: "ok" },
      itens: [{ senha: OMITIDO }],
    });
  });

  it("deixa o que não é segredo como está, e escreve datas por extenso", () => {
    const quando = new Date("2026-09-25T12:00:00.000Z");
    expect(limpaSegredos({ status: "PAUSED", orcamento: 5000, quando })).toEqual({
      status: "PAUSED",
      orcamento: 5000,
      quando: "2026-09-25T12:00:00.000Z",
    });
  });

  it("não se perde num objeto fundo demais", () => {
    let fundo: Record<string, unknown> = { fim: true };
    for (let i = 0; i < 10; i++) fundo = { dentro: fundo };
    expect(JSON.stringify(limpaSegredos(fundo))).toContain(OMITIDO);
  });
});
