/**
 * Who is making an API request, and whether they may.
 *
 * Every route that reads or writes somebody's data starts with `authenticate`,
 * and every query after it is scoped by the id it returns. There is no
 * ambient "current user" a query could forget to filter on — a function that
 * needs one takes it as its first argument (see lib/queries.ts).
 *
 * Two kinds of credential:
 *
 *   A SESSION cookie, from a browser that signed in. It may do anything its
 *   account may, but a state-changing request carrying one must come from this
 *   app's own pages (lib/request-info.ts `isSameOriginRequest`).
 *
 *   An API TOKEN, as `Authorization: Bearer snk_...`, for automations. DEFAULT
 *   DENY: a route that does not name the scope it accepts refuses every token,
 *   so a new route cannot become reachable by the steps Shortcut by accident.
 */

import { prisma } from "../db";
import { ApiError } from "../api";
import { isSameOriginRequest } from "../request-info";
import { readCookie } from "./cookies";
import { ALL_SCOPES, parseScopes, type Scope } from "./scopes";
import { SESSION_COOKIE, resolveSession, type SessionUser } from "./session";
import { hashToken, looksLikeApiToken } from "./tokens";

export interface Principal {
  user: SessionUser;
  via: "session" | "token";
  sessionId: string | null;
  tokenId: string | null;
  scopes: ReadonlySet<Scope>;
}

export interface GuardOptions {
  /** The scope an API token needs for this route. Without one, tokens are refused. */
  scope?: Scope;
  /** Account management: refuse tokens outright, whatever their scopes. */
  sessionOnly?: boolean;
  admin?: boolean;
}

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Record token use at most this often; the column is for "last used", not a log. */
const TOKEN_TOUCH_MS = 5 * 60 * 1000;

async function resolveToken(value: string, now: Date): Promise<Principal | null> {
  if (!looksLikeApiToken(value)) return null;
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(value) },
    include: {
      user: { select: { id: true, email: true, name: true, role: true, createdAt: true, disabledAt: true } },
    },
  });
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= now) || row.user.disabledAt) {
    return null;
  }
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > TOKEN_TOUCH_MS) {
    await prisma.apiToken.updateMany({ where: { id: row.id }, data: { lastUsedAt: now } });
  }
  const { disabledAt: _disabled, ...user } = row.user;
  return { user, via: "token", sessionId: null, tokenId: row.id, scopes: parseScopes(row.scopes) };
}

/** The credential on a request, if it is valid — without deciding whether it is enough. */
export async function resolvePrincipal(request: Request, now: Date = new Date()): Promise<Principal | null> {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    // An explicit credential that fails does not fall back to the cookie: a
    // script sending the wrong token should hear so, not act as whoever last
    // signed in on that machine.
    const match = /^Bearer\s+(\S+)$/i.exec(authorization.trim());
    return match ? resolveToken(match[1], now) : null;
  }

  const session = await resolveSession(readCookie(request, SESSION_COOKIE), now);
  if (!session) return null;
  return { user: session.user, via: "session", sessionId: session.sessionId, tokenId: null, scopes: ALL_SCOPES };
}

export async function authenticate(request: Request, options: GuardOptions = {}): Promise<Principal> {
  const principal = await resolvePrincipal(request);
  if (!principal) throw new ApiError("Sign in to continue", 401, "unauthenticated");

  if (principal.via === "token") {
    if (options.sessionOnly || !options.scope) {
      throw new ApiError("This needs a signed-in browser, not an API token", 403, "session-required");
    }
    if (!principal.scopes.has(options.scope)) {
      throw new ApiError(`This token does not have the "${options.scope}" scope`, 403, "insufficient-scope");
    }
  } else if (UNSAFE_METHODS.has(request.method) && !isSameOriginRequest(request)) {
    throw new ApiError("Cross-origin request refused", 403, "cross-origin");
  }

  if (options.admin && principal.user.role !== "admin") {
    throw new ApiError("Only an administrator can do that", 403, "admin-only");
  }

  return principal;
}
