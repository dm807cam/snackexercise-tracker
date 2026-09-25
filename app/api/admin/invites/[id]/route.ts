import { NextRequest } from "next/server";
import { handle, notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/admin/invites/:id — withdraw an invitation before it is used. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user: actor } = await authenticate(request, { sessionOnly: true, admin: true });
    const { id } = await params;
    const { count } = await prisma.authLink.deleteMany({ where: { id, purpose: "invite", usedAt: null } });
    if (count === 0) throw notFound("Invitation");
    await audit("admin.settings_updated", { actorId: actor.id, request, detail: { withdrewInvite: id } });
    return { deleted: true };
  });
}
