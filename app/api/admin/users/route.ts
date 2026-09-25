import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/users — the accounts on this instance.
 *
 * Counts and dates, never content. An administrator runs the instance; they
 * have no business reading anybody's training log, and this endpoint gives
 * them no way to.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await authenticate(request, { sessionOnly: true, admin: true });
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        disabledAt: true,
        lastLoginAt: true,
        createdAt: true,
        passwordHash: true,
        _count: { select: { entries: true, sessions: true, apiTokens: { where: { revokedAt: null } } } },
      },
    });
    return {
      users: users.map(({ passwordHash, _count, ...user }) => ({
        ...user,
        // The legacy owner before /setup claims it; nobody else should ever be here.
        canSignIn: passwordHash !== null,
        entries: _count.entries,
        sessions: _count.sessions,
        tokens: _count.apiTokens,
      })),
    };
  });
}
