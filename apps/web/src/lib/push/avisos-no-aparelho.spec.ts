import { chaveEmBytes, navegadorSabe } from "./avisos-no-aparelho";

describe("avisos no aparelho", () => {
  it("converte a chave pública (base64 de URL) em bytes", () => {
    // "AQID-_8" em base64 de URL são os bytes 1, 2, 3, 251, 255.
    expect(Array.from(chaveEmBytes("AQID-_8"))).toEqual([1, 2, 3, 251, 255]);
  });

  it("diz que o navegador não sabe quando não há service worker", () => {
    expect(navegadorSabe()).toBe(false);
  });
});
