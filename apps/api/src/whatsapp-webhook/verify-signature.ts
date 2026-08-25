import * as crypto from "crypto";

/**
 * Verifies Meta's `X-Hub-Signature-256: sha256=<hex>` header, computed over
 * the *raw* request body bytes with the app secret as the HMAC key. Must be
 * given the raw bytes (see main.ts's `verify` hook on the JSON body parser)
 * — signing over the re-serialized/parsed JSON would not match, since key
 * order and whitespace aren't guaranteed to round-trip identically.
 */
export function verifyWhatsAppSignature(rawBody: Buffer, signatureHeader: string | undefined, appSecret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuffer = Buffer.from(expected, "hex");
  const providedBuffer = Buffer.from(provided, "hex");
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}
