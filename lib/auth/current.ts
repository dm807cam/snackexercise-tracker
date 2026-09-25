/**
 * The signed-in user, for server components.
 *
 * Pages read the session from the cookie store rather than a Request (they are
 * not given one); the rules are the same ones lib/auth/guard.ts applies to API
 * routes. A page that shows somebody's data calls `requireUser` and passes the
 * id it returns to every query — see lib/queries.ts.
 */

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { needsSetup } from "./accounts";
import { safeNextPath } from "./next-path";
import { SESSION_COOKIE, resolveSession, type SessionUser } from "./session";

export { safeNextPath };

export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const session = await resolveSession(store.get(SESSION_COOKIE)?.value);
  return session?.user ?? null;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (user) return user;
  if (await needsSetup()) redirect("/setup");
  // Set by proxy.ts, so a page can send someone back to where they were.
  const path = (await headers()).get("x-request-path");
  redirect(`/login${path && path !== "/" ? `?next=${encodeURIComponent(safeNextPath(path))}` : ""}`);
}

/** Admin pages 404 for everyone else rather than advertising that they exist. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") notFound();
  return user;
}
