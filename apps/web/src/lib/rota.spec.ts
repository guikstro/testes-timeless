import { rota } from "./rota";

describe("rota", () => {
  it("monta o caminho com o id como está quando ele é um id", () => {
    expect(rota`/leads/${"3f2b"}/messages`).toBe("/leads/3f2b/messages");
  });

  it("não deixa um valor malformado trocar a rota chamada", () => {
    expect(rota`/leads/${"../auth/sessoes?"}`).toBe("/leads/..%2Fauth%2Fsessoes%3F");
    expect(rota`/verbas/${"a/b#c"}`).toBe("/verbas/a%2Fb%23c");
  });
});
