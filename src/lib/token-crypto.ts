// AES-256-GCM encryption for OAuth tokens at rest.
// Uses TOKEN_ENCRYPTION_KEY env var (32-byte hex string).
// If the key is not set, falls back to plaintext (with a console warning) so
// development still works — but production MUST set the key.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const KEY_HEX = process.env.TOKEN_ENCRYPTION_KEY || "";
const KEY = KEY_HEX ? Buffer.from(KEY_HEX, "hex") : null;

if (!KEY && process.env.NODE_ENV === "production") {
  console.error("[token-crypto] TOKEN_ENCRYPTION_KEY not set — tokens will be stored in plaintext. Set a 32-byte hex key (64 hex chars) in production.");
}

const IV_LEN = 12; // GCM standard IV length
const TAG_LEN = 16;

export function encryptToken(plaintext: string | null | undefined): string | null {
  if (!plaintext) return null;
  if (!KEY) return plaintext; // dev fallback — plaintext
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: "enc:" + base64(iv + tag + ciphertext)
  return "enc:" + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptToken(stored: string | null | undefined): string | null {
  if (!stored) return null;
  if (!KEY) return stored; // dev fallback
  if (!stored.startsWith("enc:")) {
    // Legacy plaintext token (pre-encryption) — return as-is so migration is seamless.
    return stored;
  }
  try {
    const buf = Buffer.from(stored.slice(4), "base64");
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const enc = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv("aes-256-gcm", KEY, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null; // decryption failed — treat as invalid token
  }
}

export function isEncryptionEnabled(): boolean {
  return !!KEY;
}
