import { scryptSync, randomBytes, timingSafeEqual } from "crypto";

// Password policy per doc 06 §9:
// - Minimum 12 characters
// - Requires uppercase, lowercase, number, special character
// - Disallow common passwords

const COMMON_PASSWORDS = new Set([
  "password", "12345678", "qwerty123", "abc123", "letmein",
  "admin123", "welcome123", "password123", "myfng1234",
]);

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
  strength: "weak" | "fair" | "good" | "strong";
}

export function validatePassword(password: string): PasswordPolicyResult {
  const errors: string[] = [];
  if (password.length < 12) errors.push("Password must be at least 12 characters");
  if (!/[A-Z]/.test(password)) errors.push("Password must contain an uppercase letter");
  if (!/[a-z]/.test(password)) errors.push("Password must contain a lowercase letter");
  if (!/[0-9]/.test(password)) errors.push("Password must contain a number");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Password must contain a special character");
  if (COMMON_PASSWORDS.has(password.toLowerCase())) errors.push("Password is too common");

  // Strength score
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;
  if (!COMMON_PASSWORDS.has(password.toLowerCase())) score++;
  const strength = score <= 2 ? "weak" : score <= 3 ? "fair" : score <= 4 ? "good" : "strong";

  return { valid: errors.length === 0, errors, strength };
}

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

// Account lockout policy per doc 06 §11
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export function isLocked(lockedUntil: Date | null): boolean {
  if (!lockedUntil) return false;
  return new Date(lockedUntil) > new Date();
}

export function generateToken(): string {
  return randomBytes(32).toString("hex");
}
