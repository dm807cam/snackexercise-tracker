import { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { config } from "@/lib/config";
import { prisma } from "@/lib/db";
import {
  AccountError,
  LEGACY_OWNER_ID,
  createFirstAdmin,
  emailSchema,
  nameSchema,
  needsSetup,
} from "@/lib/auth/accounts";
import { signIn } from "@/lib/auth/http";
import { hitRateLimit } from "@/lib/rate-limit";
import { clientIp, isSameOriginRequest } from "@/lib/request-info";

export const dynamic = "force-dynamic";

/** GET /api/auth/setup — whether this instance still needs its first admin. */
export async function GET() {
  return handle(async () => {
    const pending = await needsSetup();
    if (!pending) return { needsSetup: false };

    const legacy = await prisma.user.findUnique({
      where: { id: LEGACY_OWNER_ID },
      select: { passwordHash: true, _count: { select: { entries: true } } },
    });
    return {
      needsSetup: true,
      tokenRequired: config.setupToken !== null,
      // The setup page says "your existing log will be kept" when there is one.
      existingEntries: legacy && legacy.passwordHash === null ? legacy._count.entries : 0,
    };
  });
}

const bodySchema = z.object({
  email: emailSchema,
  name: nameSchema.optional(),
  password: z.string().min(1).max(200),
  setupToken: z.string().max(200).optional(),
});

function sameSecret(given: string, expected: string): boolean {
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** POST /api/auth/setup — create (or claim) the first admin and sign them in. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    if (!isSameOriginRequest(request)) throw new ApiError("Cross-origin request refused", 403);

    const ip = clientIp(request.headers);
    const limit = await hitRateLimit(`setup:${ip ?? "unknown"}`, 10, 15 * 60);
    if (!limit.allowed) {
      throw new ApiError("Too many attempts. Wait a few minutes.", 429, "rate-limited", {
        "retry-after": String(limit.retryAfterSec),
      });
    }

    const input = bodySchema.parse(await request.json());
    if (!(await needsSetup())) {
      throw new ApiError("This instance already has an administrator.", 409, "already-set-up");
    }

    const expected = config.setupToken;
    if (expected && !sameSecret(input.setupToken ?? "", expected)) {
      throw new ApiError("The setup token is not right. It is the SETUP_TOKEN the container was started with.", 403, "bad-setup-token");
    }

    try {
      const { user, claimedLegacy } = await createFirstAdmin(input);
      await audit("auth.setup", { actorId: user.id, request, detail: { claimedLegacy } });
      return signIn(request, user, { claimedLegacy });
    } catch (error) {
      if (error instanceof AccountError) throw new ApiError(error.message, error.status, error.code);
      throw error;
    }
  });
}
