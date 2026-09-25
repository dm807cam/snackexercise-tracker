import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { resolvePrincipal } from "@/lib/auth/guard";
import { destroySession } from "@/lib/auth/session";
import { withClearedSession } from "@/lib/auth/http";
import { isSameOriginRequest } from "@/lib/request-info";

export const dynamic = "force-dynamic";

/** Ends this browser's session. Always succeeds, and always clears the cookie. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    if (isSameOriginRequest(request)) {
      const principal = await resolvePrincipal(request);
      if (principal?.sessionId) {
        await destroySession(principal.sessionId);
        await audit("auth.logout", { actorId: principal.user.id, request });
      }
    }
    return withClearedSession(request, NextResponse.json({ ok: true }));
  });
}
