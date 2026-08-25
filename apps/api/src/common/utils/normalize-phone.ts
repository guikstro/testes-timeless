import { parsePhoneNumberFromString } from "libphonenumber-js";

const DEFAULT_COUNTRY = "BR";

/**
 * Normalizes to E.164 (e.g. `+5585999999999`).
 *
 * Tries, in order:
 *  1. As already-international: WhatsApp's own `wa_id` is digits-only with
 *     the destination country code already included (no leading `+`), e.g.
 *     "5585999999999" — this is our real, primary input source, so it's
 *     tried first.
 *  2. As a national number for `DEFAULT_COUNTRY`, for arbitrarily-formatted
 *     input that has no country code at all (e.g. a number typed by hand
 *     elsewhere in the app later: "(85) 99999-9999").
 *  3. A digits-only fallback, so one malformed number never blocks
 *     ingestion of an entire webhook — see docs/WHATSAPP.md.
 */
export function normalizePhone(rawPhone: string): string {
  const trimmed = rawPhone.trim();
  if (!trimmed) {
    throw new Error("Cannot normalize an empty phone number");
  }

  if (trimmed.startsWith("+")) {
    const parsed = parsePhoneNumberFromString(trimmed);
    return parsed?.isValid() ? parsed.number : trimmed;
  }

  const digitsOnly = trimmed.replace(/[^\d]/g, "");
  if (!digitsOnly) {
    throw new Error("Cannot normalize an empty phone number");
  }

  const asInternational = parsePhoneNumberFromString(`+${digitsOnly}`);
  if (asInternational?.isValid()) {
    return asInternational.number;
  }

  const asNational = parsePhoneNumberFromString(digitsOnly, DEFAULT_COUNTRY);
  if (asNational?.isValid()) {
    return asNational.number;
  }

  return `+${digitsOnly}`;
}
