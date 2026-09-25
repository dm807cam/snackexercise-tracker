import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";
import { destroyUserSessions } from "@/lib/auth/session";
import { hitRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(1).max(200),
});

/**
 * POST /api/me/password — change your password. Every OTHER session ends: the
 * usual reason to change a password is that someone else might have it.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user, sessionId } = await authenticate(request, { sessionOnly: true });
    const limit = await hitRateLimit(`password:${user.id}`, 10, 15 * 60);
    if (!limit.allowed) {
      throw new ApiError("Too many attempts. Wait a few minutes.", 429, "rate-limited", {
        "retry-after": String(limit.retryAfterSec),
      });
    }

    const { currentPassword, newPassword } = bodySchema.parse(await request.json());
    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(currentPassword, row.passwordHash))) {
      throw new ApiError("Your current password is not right", 403, "bad-credentials");
    }
    const problem = passwordProblem(newPassword, { email: row.email, name: row.name ?? undefined });
    if (problem) throw new ApiError(problem, 400, "weak-password");

    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(newPassword) } });
    const ended = await destroyUserSessions(user.id, sessionId);
    await audit("auth.password_changed", { actorId: user.id, request, detail: { otherSessionsEnded: ended } });
    return { ok: true, otherSessionsEnded: ended };
  });
}
