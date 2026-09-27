import { origemPublica } from "./origem-publica";

const interna = "http://localhost:10000";

describe("origemPublica", () => {
  it("usa o endereço que o proxy informa, e não a porta interna", () => {
    const cabecalhos = new Headers({ "x-forwarded-host": "timeless-crm.onrender.com", "x-forwarded-proto": "https" });
    expect(origemPublica(cabecalhos, interna)).toBe("https://timeless-crm.onrender.com");
  });

  it("pega o primeiro valor quando o cabeçalho passou por mais de um proxy", () => {
    const cabecalhos = new Headers({ "x-forwarded-host": "app.exemplo.com.br, interno", "x-forwarded-proto": "https, http" });
    expect(origemPublica(cabecalhos, interna)).toBe("https://app.exemplo.com.br");
  });

  it("sem proxy, usa o host da requisição", () => {
    expect(origemPublica(new Headers({ host: "localhost:3000" }), "http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("não aceita um host que mudaria o endereço", () => {
    for (const host of ["evil.com/caminho", "a@evil.com", "evil.com\\x", "exemplo.com #"]) {
      expect(origemPublica(new Headers({ "x-forwarded-host": host }), interna)).toBe(interna);
    }
  });

  it("não aceita um protocolo estranho", () => {
    const cabecalhos = new Headers({ "x-forwarded-host": "exemplo.com", "x-forwarded-proto": "javascript" });
    expect(origemPublica(cabecalhos, interna)).toBe(interna);
  });
});
