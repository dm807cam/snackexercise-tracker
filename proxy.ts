import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs before every page and API request (see `config.matcher`).
 *
 * Three jobs, none of them the security boundary:
 *
 *  1. A REQUEST ID on every request and response, so a log line, an error the
 *     user reports and the audit trail can be tied together.
 *  2. A CONTENT SECURITY POLICY with a fresh nonce per page: scripts run only
 *     if Next.js rendered them for this response. Styles stay 'unsafe-inline'
 *     because React's style attributes need it; injected style cannot run code.
 *  3. An optimistic redirect to /login for a page request with no session
 *     cookie at all, so a signed-out visitor gets the login page rather than a
 *     render that would redirect anyway.
 *
 * The boundary is in the pages and routes themselves: every one resolves the
 * session against the database (lib/auth) and scopes its queries by the user it
 * finds. A cookie that merely exists gets nobody anything.
 */

const SESSION_COOKIE = "snack_session";

/** Pages a signed-out visitor may see. */
const PUBLIC_PAGES = ["/login", "/setup", "/signup", "/invite/", "/reset/"];

function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.some((prefix) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix,
  );
}

function contentSecurityPolicy(nonce: string, https: boolean): string {
  const dev = process.env.NODE_ENV === "development";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only over HTTPS: on a plain-http LAN install it would make the browser
    // rewrite every asset URL to an https that does not exist.
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const requestId = request.headers.get("x-request-id")?.slice(0, 100) || crypto.randomUUID();
  const isApi = pathname.startsWith("/api/");

  if (!isApi && !isPublicPage(pathname) && !request.cookies.has(SESSION_COOKIE)) {
    const login = new URL("/login", request.url);
    if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
    const response = NextResponse.redirect(login);
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const headers = new Headers(request.headers);
  headers.set("x-request-id", requestId);
  headers.set("x-request-path", `${pathname}${search}`);

  const https =
    (request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ??
      request.nextUrl.protocol.replace(":", "")) === "https";

  let csp: string | null = null;
  if (!isApi) {
    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    csp = contentSecurityPolicy(nonce, https);
    // Next.js reads the nonce back out of this request header and puts it on
    // the scripts it renders.
    headers.set("content-security-policy", csp);
  }

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  if (csp) response.headers.set("content-security-policy", csp);
  // Only ever sent over HTTPS, where it can do no harm: a plain-http LAN
  // install never tells a browser to insist on a TLS it does not have.
  if (https) response.headers.set("strict-transport-security", "max-age=31536000");
  return response;
}

export const config = {
  matcher: [
    {
      // Everything except build assets and the static files in public/.
      source:
        "/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|icon-.*\\.png|sw\\.js|manifest\\.webmanifest).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
