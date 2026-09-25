/**
 * Password hashing and policy. Node's own scrypt, no native dependency.
 *
 * PARAMETERS. N = 2^15, r = 8, p = 3: one of the OWASP Password Storage Cheat
 * Sheet's equivalent scrypt configurations, chosen from that list for the
 * smallest memory footprint (32 MiB per hash) because this runs in a small
 * container where several people may sign in at once. The parameters travel
 * inside the stored hash, so raising them later only needs `needsRehash` and a
 * sign-in — nobody's password has to be reset.
 *
 * POLICY follows NIST SP 800-63B rather than folklore: a minimum length, a
 * generous maximum, a short list of passwords every guesser tries first, and
 * no composition rules. Requiring "a digit and a symbol" produces Password1!
 * and is not a defence against anything.
 */

import { randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "node:crypto";

export const SCRYPT_PARAMS = { N: 2 ** 15, r: 8, p: 3, keylen: 64 } as const;

/**
 * Headroom over what the parameters need: OpenSSL checks 128 * r * (N + 2) * 4
 * plus the p blocks, which is just over Node's 32 MiB default.
 */
const MAXMEM = 96 * 1024 * 1024;

import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password-policy";

export { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH };

function scrypt(password: string, salt: Buffer, keylen: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password.normalize("NFKC"), salt, keylen, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

interface ParsedHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

function parse(stored: string): ParsedHash | null {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every((n) => Number.isInteger(n) && n > 0)) return null;
  // A tampered row must not be able to make a sign-in allocate gigabytes.
  if (N > 2 ** 20 || r > 16 || p > 16) return null;
  const salt = Buffer.from(parts[4], "base64url");
  const hash = Buffer.from(parts[5], "base64url");
  if (salt.length < 16 || hash.length < 32) return null;
  return { N, r, p, salt, hash };
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const { N, r, p, keylen } = SCRYPT_PARAMS;
  const hash = await scrypt(password, salt, keylen, { N, r, p, maxmem: MAXMEM });
  return ["scrypt", N, r, p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parsed = parse(stored);
  if (!parsed) return false;
  const candidate = await scrypt(password, parsed.salt, parsed.hash.length, {
    N: parsed.N,
    r: parsed.r,
    p: parsed.p,
    maxmem: MAXMEM,
  });
  return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
}

/** True when a stored hash was made with weaker parameters than today's. */
export function needsRehash(stored: string): boolean {
  const parsed = parse(stored);
  if (!parsed) return true;
  return (
    parsed.N !== SCRYPT_PARAMS.N ||
    parsed.r !== SCRYPT_PARAMS.r ||
    parsed.p !== SCRYPT_PARAMS.p ||
    parsed.hash.length !== SCRYPT_PARAMS.keylen
  );
}

/**
 * A hash of nothing in particular, computed once, so a sign-in for an address
 * that does not exist costs the same scrypt as one that does. Without it the
 * response time tells an attacker which addresses have accounts.
 */
let dummy: Promise<string> | null = null;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword(randomBytes(16).toString("hex"));
  await verifyPassword(password, await dummy);
}

/**
 * The passwords a guesser tries before any other. Not a breach corpus — a
 * container that phones home to check one would be its own problem — just the
 * top of every published list, which is where almost all real guessing lands.
 */
const COMMON = new Set([
  "password", "password1", "password12", "password123", "password1234", "passw0rd",
  "123456", "1234567", "12345678", "123456789", "1234567890", "0123456789",
  "qwerty", "qwerty123", "qwertyuiop", "1q2w3e4r5t", "1qaz2wsx3edc", "abc123456",
  "iloveyou", "letmein", "welcome", "welcome1", "admin", "administrator",
  "changeme", "trustno1", "sunshine", "football", "baseball", "dragon",
  "monkey", "starwars", "whatever", "princess", "superman", "michael",
  "fitness", "workout", "snacktracker", "exercise",
]);

/**
 * Why a password is not acceptable, or null if it is. Plain sentences, because
 * they are shown to the person choosing it.
 */
export function passwordProblem(password: string, context: { email?: string; name?: string } = {}): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters — a few words together is easier to remember than symbols.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `That is longer than ${MAX_PASSWORD_LENGTH} characters.`;
  }
  const lowered = password.toLowerCase();
  if (COMMON.has(lowered) || COMMON.has(lowered.replace(/[^a-z0-9]/g, ""))) {
    return "That password is on every list of the first ones guessed.";
  }
  if (/^(.)\1+$/.test(password)) {
    return "One character repeated is guessed almost immediately.";
  }
  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && lowered.includes(local)) {
    return "Don't build the password from your email address.";
  }
  return null;
}
