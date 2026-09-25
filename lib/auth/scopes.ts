/**
 * What an API token may do. A browser session may do everything its account
 * may; a token may do only what it was issued for, and never anything that
 * manages the account itself — changing a password, issuing more tokens,
 * administering other people. Those need a person at a browser.
 */

export const SCOPES = {
  read: "Read your log, stats and settings",
  "entries:write": "Log, edit and delete entries",
  "metrics:write": "Record steps and brisk minutes",
  "calendar:read": "Subscribe to your snack plan from a calendar app",
} as const;

export type Scope = keyof typeof SCOPES;

export const SCOPE_NAMES = Object.keys(SCOPES) as Scope[];

/** What a session holds: everything a token could be granted. */
export const ALL_SCOPES: ReadonlySet<Scope> = new Set(SCOPE_NAMES);

export function isScope(value: string): value is Scope {
  return value in SCOPES;
}

export function parseScopes(value: string | null | undefined): Set<Scope> {
  return new Set((value ?? "").split(/\s+/).filter(isScope));
}

export function formatScopes(scopes: Iterable<Scope>): string {
  const wanted = new Set(scopes);
  return SCOPE_NAMES.filter((scope) => wanted.has(scope)).join(" ");
}
