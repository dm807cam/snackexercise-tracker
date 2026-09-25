import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { burnPasswordCheck, hashPassword, needsRehash, verifyPassword } from "@/lib/auth/password";
import { emailSchema } from "@/lib/auth/accounts";
import { signIn } from "@/lib/auth/http";
import { clearRateLimit, hitRateLimit } from "@/lib/rate-limit";
import { clientIp, isSameOriginRequest } from "@/lib/request-info";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(200),
});

const WINDOW_SEC = 15 * 60;

/**
 * Throttling, three ways, all counted per attempt and all temporary:
 *
 *   one address from one IP     10 per 15 min — a guesser at one keyboard
 *   one address from anywhere   50 per 15 min — a guesser with many IPs
 *   one IP against anyone      100 per 15 min — one IP spraying many accounts
 *
 * The pair limit is the tight one so that somebody hammering an account from
 * elsewhere does not lock its owner out at home; the per-address limit still
 * caps a distributed attack. None of this is a lockout — every window resets.
 */
const LIMITS = { pair: 10, email: 50, ip: 100 };

export async function POST(request: NextRequest) {
  return handle(async () => {
    // Signing in sets a cookie; a cross-site page must not be able to sign a
    // victim into an attacker's account (login CSRF).
    if (!isSameOriginRequest(request)) throw new ApiError("Cross-origin request refused", 403);

    const { email, password } = bodySchema.parse(await request.json());
    const ip = clientIp(request.headers);

    const checks = [
      hitRateLimit(`login:email:${email}`, LIMITS.email, WINDOW_SEC),
      ...(ip
        ? [
            hitRateLimit(`login:pair:${ip}:${email}`, LIMITS.pair, WINDOW_SEC),
            hitRateLimit(`login:ip:${ip}`, LIMITS.ip, WINDOW_SEC),
          ]
        : []),
    ];
    const results = await Promise.all(checks);
    const blocked = results.find((r) => !r.allowed);
    if (blocked) {
      await audit("auth.login_throttled", { request, detail: { email } });
      throw new ApiError(
        "Too many sign-in attempts. Wait a few minutes and try again.",
        429,
        "rate-limited",
        { "retry-after": String(blocked.retryAfterSec) },
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    const ok = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
    if (!user?.passwordHash) await burnPasswordCheck(password);

    // One message for every failure, so the form cannot be used to find out
    // which addresses have accounts or which accounts are disabled.
    if (!user || !ok || user.disabledAt) {
      await audit("auth.login_failed", {
        targetId: user?.id ?? null,
        request,
        detail: { email, reason: !user ? "no-account" : !ok ? "password" : "disabled" },
      });
      throw new ApiError("Email or password is incorrect", 401, "bad-credentials");
    }

    if (needsRehash(user.passwordHash!)) {
      await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
    }
    if (ip) await clearRateLimit(`login:pair:${ip}:${email}`);

    await audit("auth.login", { actorId: user.id, request });
    return signIn(request, user);
  });
}
