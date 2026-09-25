import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";
import { emailSchema } from "@/lib/auth/accounts";
import { LINK_TTL_HOURS, issueLink } from "@/lib/auth/links";
import { publicOrigin } from "@/lib/request-info";

export const dynamic = "force-dynamic";

/** GET /api/admin/invites — invitations not yet used or expired. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await authenticate(request, { sessionOnly: true, admin: true });
    const invites = await prisma.authLink.findMany({
      where: { purpose: "invite", usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, createdAt: true, expiresAt: true },
    });
    return { invites };
  });
}

const createSchema = z.object({
  email: emailSchema.optional(),
  role: z.enum(["admin", "member"]).default("member"),
});

/**
 * POST /api/admin/invites — a link someone can use once to create an account.
 * Addressed to an email if given, in which case only that address can use it.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user: actor } = await authenticate(request, { sessionOnly: true, admin: true });
    const input = createSchema.parse(await request.json());

    if (input.email) {
      const clash = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (clash) throw new ApiError("That address already has an account.", 409, "email-taken");
    }

    const { token, expiresAt, id } = await issueLink({
      purpose: "invite",
      email: input.email ?? null,
      role: input.role,
      createdById: actor.id,
    });
    await audit("admin.invite_created", { actorId: actor.id, request, detail: { inviteId: id, email: input.email, role: input.role } });
    return { id, url: `${publicOrigin(request)}/invite/${token}`, expiresAt, validHours: LINK_TTL_HOURS.invite };
  });
}
