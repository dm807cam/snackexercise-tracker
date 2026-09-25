/**
 * The password rules the browser needs to know about. Split from
 * lib/auth/password.ts so a client component can import them without pulling
 * node:crypto into the browser bundle.
 */
export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 200;
