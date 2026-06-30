import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const hashBuf = Buffer.from(hash, "hex");
    const testBuf = scryptSync(password, salt, 64);
    if (hashBuf.length !== testBuf.length) return false;
    return timingSafeEqual(hashBuf, testBuf);
  } catch {
    return false;
  }
}
