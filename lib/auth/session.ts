/**
 * Browser sessions. The cookie holds 32 random bytes; the Session row is keyed
 * by their SHA-256, so the table alone cannot sign anybody in.
 *
 * Sliding expiry: a session lasts SESSION_TTL_DAYS from its last use, renewed
 * at most once an hour so an active browser is not a write on every request.
 * Signing out, changing a password, being disabled and being deleted all end
 * sessions by deleting (or refusing) their rows — there is no signed token to
 * outlive the database's opinion.
 */

import { prisma } from "../db";
import { config } from "../config";
import { hashToken, randomToken } from "./tokens";

export const SESSION_COOKIE = "snack_session";

/** Renew the expiry, and record activity, at most this often. */
const TOUCH_INTERVAL_MS = 60 * 60 * 1000;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  createdAt: Date;
}

const userSelect = { id: true, email: true, name: true, role: true, createdAt: true, disabledAt: true } as const;

function ttlMs(): number {
  return config.sessionTtlDays * 86_400_000;
}

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
): Promise<{ token: string; expiresAt: Date; id: string }> {
  const token = randomToken(32);
  const id = hashToken(token);
  const expiresAt = new Date(Date.now() + ttlMs());
  await prisma.session.create({
    data: { id, userId, expiresAt, userAgent: meta.userAgent ?? null, ip: meta.ip ?? null },
  });
  return { token, expiresAt, id };
}

/**
 * The session a cookie value names, if it is live and its user is enabled.
 * Expired rows are deleted on sight.
 */
export async function resolveSession(
  token: string | null | undefined,
  now: Date = new Date(),
): Promise<{ sessionId: string; user: SessionUser } | null> {
  if (!token || token.length < 20 || token.length > 100) return null;
  const id = hashToken(token);
  const session = await prisma.session.findUnique({
    where: { id },
    include: { user: { select: userSelect } },
  });
  if (!session) return null;

  if (session.expiresAt <= now) {
    await prisma.session.deleteMany({ where: { id } });
    return null;
  }
  if (session.user.disabledAt) return null;

  if (now.getTime() - session.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.updateMany({
      where: { id },
      data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + ttlMs()) },
    });
  }

  const { disabledAt: _disabled, ...user } = session.user;
  return { sessionId: id, user };
}

export async function destroySession(sessionId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { id: sessionId } });
}

/** Ends every session of a user except, optionally, the one making the request. */
export async function destroyUserSessions(userId: string, exceptSessionId?: string | null): Promise<number> {
  const { count } = await prisma.session.deleteMany({
    where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
  });
  return count;
}

export async function purgeExpiredSessions(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.session.deleteMany({ where: { expiresAt: { lt: now } } });
  return count;
}

export interface CookieSpec {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  expires?: Date;
  maxAge?: number;
}

/**
 * The session cookie. HttpOnly so no script can read it, SameSite=Lax so no
 * other site's form can send it, Secure whenever the app is reached over HTTPS.
 */
export function sessionCookie(token: string, expiresAt: Date, secure: boolean): CookieSpec {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure ?? secure,
    path: "/",
    expires: expiresAt,
  };
}

export function clearedSessionCookie(secure: boolean): CookieSpec {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure ?? secure,
    path: "/",
    maxAge: 0,
  };
}
