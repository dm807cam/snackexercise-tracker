import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma, transaction } from "@/lib/db";
import { signIn } from "@/lib/auth/http";
import { consumeLink, peekLink } from "@/lib/auth/links";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { destroyUserSessions } from "@/lib/auth/session";
import { hitRateLimit } from "@/lib/rate-limit";
import { clientIp, isSameOriginRequest } from "@/lib/request-info";

export const dynamic = "force-dynamic";

/** GET /api/auth/reset?token=… — whether a reset link is still good. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const link = await peekLink(request.nextUrl.searchParams.get("token") ?? "", "reset");
    if (!link?.userId) return { valid: false };
    const user = await prisma.user.findUnique({ where: { id: link.userId }, select: { email: true } });
    return user ? { valid: true, email: user.email } : { valid: false };
  });
}

const bodySchema = z.object({
  token: z.string().min(1).max(100),
  password: z.string().min(1).max(200),
});

/**
 * POST /api/auth/reset — set a new password from a reset link. Every existing
 * session of the account ends: a reset usually means the old password, or a
 * device that had it, can no longer be trusted.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    if (!isSameOriginRequest(request)) throw new ApiError("Cross-origin request refused", 403);
    const limit = await hitRateLimit(`reset:${clientIp(request.headers) ?? "unknown"}`, 20, 15 * 60);
    if (!limit.allowed) {
      throw new ApiError("Too many attempts. Wait a few minutes.", 429, "rate-limited", {
        "retry-after": String(limit.retryAfterSec),
      });
    }

    const { token, password } = bodySchema.parse(await request.json());
    const link = await peekLink(token, "reset");
    if (!link?.userId) throw new ApiError("This reset link has expired or was already used.", 410, "link-invalid");

    const target = await prisma.user.findUnique({ where: { id: link.userId } });
    if (!target || target.disabledAt) throw new ApiError("This reset link has expired or was already used.", 410, "link-invalid");

    const problem = passwordProblem(password, { email: target.email, name: target.name ?? undefined });
    if (problem) throw new ApiError(problem, 400, "weak-password");
    const passwordHash = await hashPassword(password);

    await transaction(async (tx) => {
      const spent = await consumeLink(tx, token, "reset");
      if (!spent) throw new ApiError("This reset link has expired or was already used.", 410, "link-invalid");
      await tx.user.update({ where: { id: target.id }, data: { passwordHash } });
    });
    await destroyUserSessions(target.id);
    await audit("auth.password_reset", { actorId: target.id, request });
    return signIn(request, target);
  });
}
