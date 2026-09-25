import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";
import { isLastAdmin } from "@/lib/auth/accounts";
import { destroyUserSessions } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  role: z.enum(["admin", "member"]).optional(),
  disabled: z.boolean().optional(),
});

/**
 * PATCH /api/admin/users/:id — change someone's role, or disable/enable them.
 * Disabling ends their sessions at once; their data stays.
 */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user: actor } = await authenticate(request, { sessionOnly: true, admin: true });
    const { id } = await params;
    const input = patchSchema.parse(await request.json());

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound("User");

    const demoting = input.role === "member" && target.role === "admin";
    const disabling = input.disabled === true && !target.disabledAt;
    if ((demoting || disabling) && target.role === "admin" && (await isLastAdmin(target.id))) {
      throw new ApiError("That is the last administrator. Make someone else an admin first.", 409, "last-admin");
    }
    if (disabling && target.id === actor.id) {
      throw new ApiError("You cannot disable your own account.", 409);
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        ...(input.role ? { role: input.role } : {}),
        ...(input.disabled === undefined ? {} : { disabledAt: input.disabled ? new Date() : null }),
      },
    });
    if (disabling) await destroyUserSessions(id);

    await audit("admin.user_updated", { actorId: actor.id, targetId: id, request, detail: input });
    return { user: { id: updated.id, role: updated.role, disabledAt: updated.disabledAt } };
  });
}

/**
 * DELETE /api/admin/users/:id — delete an account and all of its data. Not for
 * your own account (Settings has that, behind your password).
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user: actor } = await authenticate(request, { sessionOnly: true, admin: true });
    const { id } = await params;
    if (id === actor.id) throw new ApiError("Delete your own account from Settings.", 409);

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw notFound("User");
    if (target.role === "admin" && (await isLastAdmin(target.id))) {
      throw new ApiError("That is the last administrator.", 409, "last-admin");
    }

    await prisma.user.delete({ where: { id } });
    await audit("admin.user_deleted", { actorId: actor.id, targetId: id, request, detail: { email: target.email } });
    return { deleted: true };
  });
}
