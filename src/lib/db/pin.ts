/**
 * Local convenience PIN handling — PBKDF2-SHA256 (100k iterations) via
 * WebCrypto, salted per PIN (no server involved).
 *
 * NB: a 4–6 digit PIN is still low-entropy; this raises the offline
 * brute-force cost if an IndexedDB dump or backup file leaks. The app treats
 * it as a device lock, not authentication against an attacker with disk
 * access (see README "Offline & privacy").
 */

const PBKDF2_ITERATIONS = 100_000;

export function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    key,
    256,
  );
  return toHex(bits);
}

/** Constant-time string comparison — avoids leaking hash bytes via timing. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPin(pin: string, salt: string, expectedHash: string): Promise<boolean> {
  const h = await hashPin(pin, salt);
  return timingSafeEqual(h, expectedHash);
}
