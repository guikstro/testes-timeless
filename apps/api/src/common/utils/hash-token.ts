import * as crypto from "crypto";

/** Deterministic SHA-256 fingerprint used to look up opaque tokens (refresh, reset) without storing them raw. */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
