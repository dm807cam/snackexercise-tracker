import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";
import { destroyUserSessions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** GET /api/me/sessions — every browser signed in to this account. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, sessionId } = await authenticate(request, { sessionOnly: true });
    const sessions = await prisma.session.findMany({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: "desc" },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, userAgent: true, ip: true },
    });
    return { sessions: sessions.map((s) => ({ ...s, current: s.id === sessionId })) };
  });
}

/** DELETE /api/me/sessions — sign out everywhere else. */
export async function DELETE(request: NextRequest) {
  return handle(async () => {
    const { user, sessionId } = await authenticate(request, { sessionOnly: true });
    const ended = await destroyUserSessions(user.id, sessionId);
    await audit("auth.sessions_revoked", { actorId: user.id, request, detail: { ended } });
    return { ended };
  });
}
