import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended nonce size for GCM

/**
 * AES-256-GCM at rest for any external secret we're forced to store
 * (WhatsApp/Meta tokens) — never store those in plaintext (Section 87).
 * Output layout: <iv>:<authTag>:<ciphertext>, each hex-encoded.
 */
@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor() {
    const hexKey = process.env.TOKEN_ENCRYPTION_KEY;
    if (!hexKey || hexKey.length !== 64) {
      throw new Error(
        "TOKEN_ENCRYPTION_KEY must be set to a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32",
      );
    }
    this.key = Buffer.from(hexKey, "hex");
  }

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
  }

  decrypt(payload: string): string {
    const [ivHex, authTagHex, ciphertextHex] = payload.split(":");
    if (!ivHex || !authTagHex || !ciphertextHex) {
      throw new Error("Malformed encrypted payload");
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
    return plaintext.toString("utf8");
  }
}
