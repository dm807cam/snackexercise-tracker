import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma, transaction } from "@/lib/db";
import {
  AccountError,
  createAccount,
  emailSchema,
  insertAccount,
  nameSchema,
  needsSetup,
  prepareAccount,
} from "@/lib/auth/accounts";
import { signIn } from "@/lib/auth/http";
import { consumeLink, peekLink } from "@/lib/auth/links";
import { registrationMode } from "@/lib/instance";
import { hitRateLimit } from "@/lib/rate-limit";
import { clientIp, isSameOriginRequest } from "@/lib/request-info";

export const dynamic = "force-dynamic";

/** GET /api/auth/signup — whether a stranger may sign up here. */
export async function GET() {
  return handle(async () => ({ registration: await registrationMode() }));
}

const bodySchema = z.object({
  email: emailSchema,
  name: nameSchema.optional(),
  password: z.string().min(1).max(200),
  invite: z.string().max(100).optional(),
});

/**
 * POST /api/auth/signup — create an account, from an invitation or, when the
 * admin has opened registration, from nothing.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    if (!isSameOriginRequest(request)) throw new ApiError("Cross-origin request refused", 403);

    const ip = clientIp(request.headers);
    const limit = await hitRateLimit(`signup:${ip ?? "unknown"}`, 10, 60 * 60);
    if (!limit.allowed) {
      throw new ApiError("Too many sign-ups from here. Try again later.", 429, "rate-limited", {
        "retry-after": String(limit.retryAfterSec),
      });
    }

    const input = bodySchema.parse(await request.json());
    if (await needsSetup()) {
      throw new ApiError("This instance has not been set up yet.", 409, "needs-setup");
    }

    try {
      if (input.invite) {
        const link = await peekLink(input.invite, "invite");
        if (!link) throw new ApiError("This invitation has expired or was already used.", 410, "invite-invalid");
        if (link.email && link.email !== input.email) {
          throw new ApiError(`This invitation is for ${link.email}.`, 403, "invite-email-mismatch");
        }

        const prepared = await prepareAccount(input);
        const user = await transaction(async (tx) => {
          const spent = await consumeLink(tx, input.invite!, "invite");
          if (!spent) throw new ApiError("This invitation has expired or was already used.", 410, "invite-invalid");
          return insertAccount(tx, { ...prepared, role: spent.role === "admin" ? "admin" : "member" });
        });
        await audit("auth.signup", { actorId: user.id, request, detail: { via: "invite", inviteId: link.id } });
        return signIn(request, user);
      }

      if ((await registrationMode()) !== "open") {
        throw new ApiError("Accounts here are by invitation. Ask your administrator for a link.", 403, "invite-only");
      }
      const user = await createAccount({ email: input.email, name: input.name, password: input.password });
      await audit("auth.signup", { actorId: user.id, request, detail: { via: "open" } });
      return signIn(request, user);
    } catch (error) {
      if (error instanceof AccountError) throw new ApiError(error.message, error.status, error.code);
      throw error;
    }
  });
}
