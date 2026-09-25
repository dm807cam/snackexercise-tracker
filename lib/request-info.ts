/**
 * What can be trusted about where a request came from.
 *
 * Next's server fills X-Forwarded-For from the socket only when the header is
 * ABSENT, so without a reverse proxy in front a client can send its own and be
 * believed. The rightmost entry is the one the nearest trusted hop appended;
 * TRUST_PROXY says how many hops to trust (default 1: one reverse proxy, or
 * none and nobody spoofing). The account-level limits in lib/auth are what
 * actually stop password guessing — an IP is a best-effort second key, never
 * the only one.
 */

import { config } from "./config";

export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const index = hops.length - Math.max(1, config.trustProxyHops);
    const ip = hops[Math.max(0, index)];
    if (ip) return ip.slice(0, 64);
  }
  return headers.get("x-real-ip")?.slice(0, 64) ?? null;
}

export function userAgent(headers: Headers): string | null {
  return headers.get("user-agent")?.slice(0, 300) ?? null;
}

/** Whether the request reached the app over HTTPS, possibly via a proxy. */
export function isHttps(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (proto) return proto === "https";
  return new URL(request.url).protocol === "https:";
}

/** The hosts a same-origin request can legitimately name. */
function expectedHosts(request: Request): Set<string> {
  const hosts = new Set<string>();
  const appUrl = config.appUrl;
  if (appUrl) hosts.add(appUrl.host.toLowerCase());
  for (const header of ["x-forwarded-host", "host"]) {
    const value = request.headers.get(header)?.split(",")[0]?.trim().toLowerCase();
    if (value) hosts.add(value);
  }
  hosts.add(new URL(request.url).host.toLowerCase());
  return hosts;
}

/**
 * Whether a state-changing request carrying a cookie came from this app's own
 * pages. The session cookie is SameSite=Lax, which already stops a cross-site
 * form post from carrying it; this is the second, independent check, and the
 * one that still holds for a same-site but cross-origin page (another app on a
 * sibling subdomain).
 *
 * Browsers send Sec-Fetch-Site and Origin on every non-GET request they make.
 * A request with neither did not come from a browser page, so a cookie on it is
 * not a confused-deputy problem.
 */
export function isSameOriginRequest(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "none";

  const origin = request.headers.get("origin");
  // An opaque origin — a sandboxed frame, a file — is never this app's page.
  if (origin === "null") return false;
  if (!origin) return true;
  try {
    return expectedHosts(request).has(new URL(origin).host.toLowerCase());
  } catch {
    return false;
  }
}

/** The origin links in invitations and resets should point at. */
export function publicOrigin(request: Request): string {
  const appUrl = config.appUrl;
  if (appUrl) return appUrl.origin;
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host") ||
    new URL(request.url).host;
  return `${isHttps(request) ? "https" : "http"}://${host}`;
}
