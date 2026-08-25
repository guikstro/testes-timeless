import { EncryptionService } from "./encryption.service";

describe("EncryptionService", () => {
  const originalEnv = process.env.TOKEN_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  });

  afterAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = originalEnv;
  });

  it("decrypts back to the original plaintext", () => {
    const service = new EncryptionService();
    const encrypted = service.encrypt("super-secret-access-token");
    expect(encrypted).not.toContain("super-secret-access-token");
    expect(service.decrypt(encrypted)).toBe("super-secret-access-token");
  });

  it("produces a different ciphertext each time (random IV) even for the same input", () => {
    const service = new EncryptionService();
    const a = service.encrypt("same-value");
    const b = service.encrypt("same-value");
    expect(a).not.toBe(b);
    expect(service.decrypt(a)).toBe("same-value");
    expect(service.decrypt(b)).toBe("same-value");
  });

  it("rejects a tampered ciphertext instead of silently returning garbage", () => {
    const service = new EncryptionService();
    const encrypted = service.encrypt("original-value");
    const [iv, authTag, ciphertext] = encrypted.split(":");
    const tampered = `${iv}:${authTag}:${ciphertext.slice(0, -2)}ff`;

    expect(() => service.decrypt(tampered)).toThrow();
  });

  it("refuses to start without a properly-sized encryption key", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "too-short";
    expect(() => new EncryptionService()).toThrow();
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
  });
});
