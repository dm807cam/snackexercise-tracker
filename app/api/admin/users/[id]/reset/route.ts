import { NextRequest } from "next/server";
import { ApiError, handle, notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";
import { LINK_TTL_HOURS, issueLink } from "@/lib/auth/links";
import { publicOrigin } from "@/lib/request-info";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/:id/reset — a one-time link that lets someone choose a
 * new password. The app sends no email; the admin passes the link on.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user: actor } = await authenticate(request, { sessionOnly: true, admin: true });
    const { id } = await params;
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound("User");
    if (target.disabledAt) throw new ApiError("Enable the account first.", 409);

    const { token, expiresAt } = await issueLink({ purpose: "reset", userId: id, createdById: actor.id });
    await audit("admin.reset_link_created", { actorId: actor.id, targetId: id, request });
    return {
      url: `${publicOrigin(request)}/reset/${token}`,
      expiresAt,
      validHours: LINK_TTL_HOURS.reset,
    };
  });
}
