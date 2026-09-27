/**
 * @jest-environment node
 */
import { decodificaTexto } from "./le-arquivo-de-texto";

describe("decodificaTexto", () => {
  it("lê o UTF-16 do CSV para Excel do Google Ads", () => {
    const texto = "Dia\tCusto\n01/09/2026\t120,50";
    const utf16 = new Uint8Array([0xff, 0xfe, ...Array.from(Buffer.from(texto, "utf16le"))]);
    expect(decodificaTexto(utf16)).toBe(texto);
  });

  it("lê UTF-8 comum, com acento", () => {
    expect(decodificaTexto(new TextEncoder().encode("Relatório de campanha"))).toBe("Relatório de campanha");
  });
});
