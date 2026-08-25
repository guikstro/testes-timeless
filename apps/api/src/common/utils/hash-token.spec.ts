import { hashToken } from "./hash-token";

describe("hashToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashToken("abc123")).toBe(hashToken("abc123"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("abc123")).not.toBe(hashToken("abc124"));
  });

  it("never returns the raw token", () => {
    expect(hashToken("my-secret-token")).not.toContain("my-secret-token");
  });

  it("returns a 64-character hex string (sha256)", () => {
    expect(hashToken("anything")).toMatch(/^[0-9a-f]{64}$/);
  });
});
