import { buildWhatsAppRedirectUrl } from "./build-whatsapp-redirect-url";

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
});
