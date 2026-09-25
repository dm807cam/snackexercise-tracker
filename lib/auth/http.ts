/**
 * Starting and ending a browser session on a response.
 */

import { NextResponse } from "next/server";
import { prisma } from "../db";
import { clientIp, isHttps, userAgent } from "../request-info";
import { clearedSessionCookie, createSession, sessionCookie, type SessionUser } from "./session";

/** Publicly safe view of an account. */
export function publicUser(user: SessionUser) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

/**
 * Sign `user` in on this response: a new session row, its cookie, and the
 * last-login stamp.
 */
export async function signIn(request: Request, user: SessionUser, body: Record<string, unknown> = {}) {
  const { token, expiresAt } = await createSession(user.id, {
    userAgent: userAgent(request.headers),
    ip: clientIp(request.headers),
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  const response = NextResponse.json({ user: publicUser(user), ...body });
  response.cookies.set(sessionCookie(token, expiresAt, isHttps(request)));
  return response;
}

export function withClearedSession(request: Request, response: NextResponse): NextResponse {
  response.cookies.set(clearedSessionCookie(isHttps(request)));
  return response;
}
