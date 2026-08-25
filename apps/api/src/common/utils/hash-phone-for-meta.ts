import * as crypto from "crypto";

/**
 * Meta's Conversions API requires `user_data.ph` as a SHA-256 hex digest of
 * the phone number with no leading "+" and no other symbols — see
 * https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters.
 * `normalizePhone` already returns digits-only E.164 (`+5585999999999`), so
 * this only strips the leading "+" before hashing.
 */
export function hashPhoneForMeta(e164Phone: string): string {
  const digitsOnly = e164Phone.replace(/^\+/, "");
  return crypto.createHash("sha256").update(digitsOnly).digest("hex");
}
