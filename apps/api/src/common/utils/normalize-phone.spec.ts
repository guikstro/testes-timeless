import { normalizePhone } from "./normalize-phone";

describe("normalizePhone", () => {
  it("normalizes a Brazilian mobile number with country code to E.164", () => {
    expect(normalizePhone("5585999999999")).toBe("+5585999999999");
  });

  it("normalizes a number already carrying a plus sign", () => {
    expect(normalizePhone("+55 85 99999-9999")).toBe("+5585999999999");
  });

  it("treats (85) 99999-9999, 85999999999, and +5585999999999 as the same key", () => {
    const a = normalizePhone("(85) 99999-9999");
    const b = normalizePhone("85999999999");
    const c = normalizePhone("+5585999999999");
    expect(a).toBe(c);
    expect(b).toBe(c);
  });

  it("strips punctuation and whitespace", () => {
    expect(normalizePhone("+55 (85) 99999-9999")).toBe("+5585999999999");
  });

  it("throws on an empty phone number rather than silently producing a bogus key", () => {
    expect(() => normalizePhone("")).toThrow();
    expect(() => normalizePhone("   ")).toThrow();
  });

  it("falls back to a stable digits-only key for a number libphonenumber can't validate", () => {
    // Too short to be a valid BR number, but must not throw — a single
    // malformed number must never block ingestion of the whole webhook.
    const result = normalizePhone("123");
    expect(result).toBe("+123");
  });
});
