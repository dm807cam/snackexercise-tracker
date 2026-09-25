import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { authenticate } from "@/lib/auth/guard";
import { emailSchema, isLastAdmin, nameSchema } from "@/lib/auth/accounts";
import { publicUser, withClearedSession } from "@/lib/auth/http";
import { verifyPassword } from "@/lib/auth/password";

export const dynamic = "force-dynamic";

/** GET /api/me — who is signed in. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user, via } = await authenticate(request, { scope: "read" });
    return { user: publicUser(user), via };
  });
}

const patchSchema = z.object({
  name: nameSchema.nullish(),
  email: emailSchema.optional(),
  /** Changing the address you sign in with needs the password. */
  currentPassword: z.string().max(200).optional(),
});

/** PATCH /api/me — change your name or sign-in address. */
export async function PATCH(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const input = patchSchema.parse(await request.json());

    const data: { name?: string | null; email?: string } = {};
    if (input.name !== undefined) data.name = input.name ?? null;

    if (input.email && input.email !== user.email) {
      const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      if (!(await verifyPassword(input.currentPassword ?? "", row.passwordHash))) {
        throw new ApiError("Your current password is needed to change your email address", 403, "password-required");
      }
      const clash = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (clash) throw new ApiError("That address already belongs to an account.", 409, "email-taken");
      data.email = input.email;
    }

    const updated = await prisma.user.update({ where: { id: user.id }, data });
    await audit("account.updated", {
      actorId: user.id,
      request,
      detail: { fields: Object.keys(data), ...(data.email ? { from: user.email, to: data.email } : {}) },
    });
    return { user: publicUser(updated) };
  });
}

const deleteSchema = z.object({ password: z.string().min(1).max(200) });

/**
 * DELETE /api/me — delete your account and everything in it: entries, days,
 * settings, places, snacks, tokens and sessions all go with it, by cascade.
 * Export first; the confirmation in Settings says so.
 */
export async function DELETE(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const { password } = deleteSchema.parse(await request.json());

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await verifyPassword(password, row.passwordHash))) {
      throw new ApiError("That password is not right", 403, "bad-credentials");
    }
    if (row.role === "admin" && (await isLastAdmin(user.id))) {
      throw new ApiError(
        "You are the only administrator. Make someone else an admin first, or the instance has nobody to run it.",
        409,
        "last-admin",
      );
    }

    await prisma.user.delete({ where: { id: user.id } });
    await audit("account.deleted", { actorId: user.id, targetId: user.id, request, detail: { email: user.email } });
    return withClearedSession(request, NextResponse.json({ deleted: true }));
  });
}
