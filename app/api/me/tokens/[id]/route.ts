import { NextRequest } from "next/server";
import { handle, notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE /api/me/tokens/:id — revoke a token. It stops working on the next request. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const { id } = await params;
    const { count } = await prisma.apiToken.updateMany({
      where: { id, userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw notFound("Token");
    await audit("token.revoked", { actorId: user.id, request, detail: { tokenId: id } });
    return { revoked: true };
  });
}
