import { LIMITE_DE_BYTES, validaImagem } from "./imagem-enviada";

const comoDataUrl = (tipo: string, bytes: Buffer) => `data:${tipo};base64,${bytes.toString("base64")}`;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
const WEBP = Buffer.concat([
  Buffer.from("RIFF", "ascii"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP", "ascii"),
  Buffer.alloc(64, 1),
]);

describe("validaImagem", () => {
  it("aceita png, jpeg e webp", () => {
    expect(validaImagem(comoDataUrl("image/png", PNG))).toMatchObject({ ok: true });
    expect(validaImagem(comoDataUrl("image/jpeg", JPEG))).toMatchObject({ ok: true });
    expect(validaImagem(comoDataUrl("image/webp", WEBP))).toMatchObject({ ok: true });
  });

  it("recusa SVG", () => {
    // SVG é XML e aceita script embutido: servido do nosso domínio, viraria
    // execução de código de terceiro na sessão de quem abrisse a página.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(validaImagem(comoDataUrl("image/svg+xml", svg))).toEqual({ ok: false, erro: "TIPO_NAO_ACEITO" });
  });

  it("recusa conteúdo que não é o tipo declarado", () => {
    // O caso perigoso: anunciar png e mandar outra coisa.
    const html = Buffer.from("<html><script>alert(1)</script></html>");
    expect(validaImagem(comoDataUrl("image/png", html))).toEqual({ ok: false, erro: "CONTEUDO_NAO_CONFERE" });
  });

  it("recusa um jpeg anunciado como png", () => {
    expect(validaImagem(comoDataUrl("image/png", JPEG))).toEqual({ ok: false, erro: "CONTEUDO_NAO_CONFERE" });
  });

  it("recusa arquivo acima do limite", () => {
    const grande = Buffer.concat([PNG.subarray(0, 8), Buffer.alloc(LIMITE_DE_BYTES + 1024, 1)]);
    expect(validaImagem(comoDataUrl("image/png", grande))).toEqual({ ok: false, erro: "GRANDE_DEMAIS" });
  });

  it("recusa texto que não é data url", () => {
    expect(validaImagem("https://exemplo.com/logo.png")).toEqual({ ok: false, erro: "FORMATO_INVALIDO" });
    expect(validaImagem("")).toEqual({ ok: false, erro: "FORMATO_INVALIDO" });
  });

  it("recusa arquivo vazio", () => {
    expect(validaImagem("data:image/png;base64,QQ==")).toMatchObject({ ok: false });
  });

  it("devolve a extensão certa para cada tipo", () => {
    const resultado = validaImagem(comoDataUrl("image/jpeg", JPEG));
    expect(resultado.ok && resultado.imagem.extensao).toBe("jpg");
  });
});
