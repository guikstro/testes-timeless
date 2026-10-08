import { buildWhatsAppRedirectUrl, sanitizeLeadMessage } from "./build-whatsapp-redirect-url";

describe("buildWhatsAppRedirectUrl", () => {
  it("adds a default greeting with the reference token when wa.me has no text param", () => {
    expect(buildWhatsAppRedirectUrl("https://wa.me/5585999999999", "AB12CD")).toBe(
      "https://wa.me/5585999999999?text=Ol%C3%A1%21+%5Bref%3AAB12CD%5D",
    );
  });

  it("appends the token to an existing prefilled greeting instead of replacing it", () => {
    const result = buildWhatsAppRedirectUrl("https://wa.me/5585999999999?text=Quero+saber+mais", "AB12CD");
    const url = new URL(result);
    expect(url.searchParams.get("text")).toBe("Quero saber mais [ref:AB12CD]");
  });

  it("works for the api.whatsapp.com/send form too", () => {
    const result = buildWhatsAppRedirectUrl("https://api.whatsapp.com/send?phone=5585999999999", "XYZ999");
    const url = new URL(result);
    expect(url.hostname).toBe("api.whatsapp.com");
    expect(url.searchParams.get("text")).toContain("[ref:XYZ999]");
  });

  it("leaves a non-WhatsApp destination completely unchanged", () => {
    expect(buildWhatsAppRedirectUrl("https://example.com/landing?utm_source=x", "AB12CD")).toBe(
      "https://example.com/landing?utm_source=x",
    );
  });

  it("returns the original string unchanged if it isn't a valid URL, rather than throwing", () => {
    expect(buildWhatsAppRedirectUrl("not-a-url", "AB12CD")).toBe("not-a-url");
  });

  describe("com mensagem da triagem (leadMessage)", () => {
    const msg = "Olá! Situação: Fui demitido(a)\nLocal: Fortaleza\nResumo: não recebi a rescisão & horas extras";

    it("substitui o texto fixo do link e põe o token em linha própria", () => {
      const result = buildWhatsAppRedirectUrl("https://wa.me/5585999999999?text=Quero+saber+mais", "AB12CD", msg);
      expect(new URL(result).searchParams.get("text")).toBe(`${msg}\n\n[ref:AB12CD]`);
    });

    it("mantém o token legível pelo extrator de atribuição", () => {
      const text = new URL(buildWhatsAppRedirectUrl("https://wa.me/5585999999999", "AB12CD", msg)).searchParams.get("text")!;
      expect(/\[ref:([A-Za-z0-9]{4,12})\]/.exec(text)?.[1]).toBe("AB12CD");
    });

    it("não altera destino que não é WhatsApp", () => {
      expect(buildWhatsAppRedirectUrl("https://example.com/landing", "AB12CD", msg)).toBe("https://example.com/landing");
    });
  });
});

describe("sanitizeLeadMessage", () => {
  it("devolve undefined para vazio ou só espaços", () => {
    expect(sanitizeLeadMessage(undefined)).toBeUndefined();
    expect(sanitizeLeadMessage("  \n ")).toBeUndefined();
  });

  it("preserva quebras de linha e acentos, normaliza CRLF e remove caracteres de controle", () => {
    expect(sanitizeLeadMessage("Olá\r\nlinha 2\u0000\u0007 ok")).toBe("Olá\nlinha 2 ok");
  });

  it("limita o tamanho a 800 caracteres", () => {
    expect(sanitizeLeadMessage("a".repeat(2000))).toHaveLength(800);
  });
});
