/**
 * Random credentials and their stored form. Pure apart from the randomness.
 *
 * Every credential the app hands out — a session cookie, an API token, an
 * invitation or reset link — is 32 random bytes, and only its SHA-256 is
 * stored. A fast hash is the right one here, unlike for passwords: the input
 * already carries 256 bits of entropy, so there is nothing for a slow hash to
 * protect against, and every authenticated request has to look one up.
 */

import { createHash, randomBytes } from "node:crypto";

/** Recognisable in logs, secret scanners and a pasted Shortcut. */
export const API_TOKEN_PREFIX = "snk_";

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export interface IssuedApiToken {
  /** Shown once, at creation, and never again. */
  token: string;
  /** What Settings shows to tell tokens apart. */
  prefix: string;
  hash: string;
}

export function issueApiToken(): IssuedApiToken {
  const token = `${API_TOKEN_PREFIX}${randomToken(32)}`;
  return { token, prefix: token.slice(0, API_TOKEN_PREFIX.length + 6), hash: hashToken(token) };
}

/** Whether a bearer value is shaped like one of ours, before any lookup. */
export function looksLikeApiToken(value: string): boolean {
  return value.startsWith(API_TOKEN_PREFIX) && /^[A-Za-z0-9_-]{40,60}$/.test(value.slice(API_TOKEN_PREFIX.length));
}
