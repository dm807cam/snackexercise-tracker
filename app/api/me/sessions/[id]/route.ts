import { NextRequest } from "next/server";
import { handle, notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/me/sessions/:id — sign out one browser. Only ever one of your own. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const { id } = await params;
    const { count } = await prisma.session.deleteMany({ where: { id, userId: user.id } });
    if (count === 0) throw notFound("Session");
    await audit("auth.sessions_revoked", { actorId: user.id, request, detail: { ended: 1 } });
    return { ended: 1 };
  });
}
