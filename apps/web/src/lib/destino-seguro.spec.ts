import { destinoSeguro } from "./destino-seguro";

describe("destinoSeguro", () => {
  it("mantém caminho deste site", () => {
    expect(destinoSeguro("/convite/abc")).toBe("/convite/abc");
  });

  it("não sai do site", () => {
    expect(destinoSeguro("https://outro.site")).toBe("/");
    expect(destinoSeguro("//outro.site")).toBe("/");
    expect(destinoSeguro("/\\outro.site")).toBe("/");
    expect(destinoSeguro(null)).toBe("/");
  });
});
