/**
 * Where to send someone after they sign in: only a path on this site, never
 * "//evil.example" or a full URL, so the login page cannot be used to bounce a
 * signed-in user somewhere else.
 */
export function safeNextPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value.startsWith("/login") || value.startsWith("/setup")) return "/";
  return value.slice(0, 500);
}
