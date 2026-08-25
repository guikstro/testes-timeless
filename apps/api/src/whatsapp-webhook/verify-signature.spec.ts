import * as crypto from "crypto";
import { verifyWhatsAppSignature } from "./verify-signature";

const APP_SECRET = "test-app-secret";

function signatureFor(body: Buffer): string {
  const hmac = crypto.createHmac("sha256", APP_SECRET).update(body).digest("hex");
  return `sha256=${hmac}`;
}

describe("verifyWhatsAppSignature", () => {
  it("accepts a correctly signed payload", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    expect(verifyWhatsAppSignature(body, signatureFor(body), APP_SECRET)).toBe(true);
  });

  it("rejects a payload signed with the wrong secret", () => {
    const body = Buffer.from(JSON.stringify({ hello: "world" }));
    const wrongSignature = crypto.createHmac("sha256", "wrong-secret").update(body).digest("hex");
    expect(verifyWhatsAppSignature(body, `sha256=${wrongSignature}`, APP_SECRET)).toBe(false);
  });

  it("rejects when the body was tampered with after signing", () => {
    const originalBody = Buffer.from(JSON.stringify({ amount: 100 }));
    const signature = signatureFor(originalBody);
    const tamperedBody = Buffer.from(JSON.stringify({ amount: 100000 }));

    expect(verifyWhatsAppSignature(tamperedBody, signature, APP_SECRET)).toBe(false);
  });

  it("rejects a missing signature header", () => {
    const body = Buffer.from("{}");
    expect(verifyWhatsAppSignature(body, undefined, APP_SECRET)).toBe(false);
  });

  it("rejects a header missing the sha256= prefix", () => {
    const body = Buffer.from("{}");
    const hmac = crypto.createHmac("sha256", APP_SECRET).update(body).digest("hex");
    expect(verifyWhatsAppSignature(body, hmac, APP_SECRET)).toBe(false);
  });
});
