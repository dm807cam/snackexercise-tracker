import { NextRequest } from "next/server";
import { ApiError, handle, notFound } from "@/lib/api";
import { audit } from "@/lib/audit";
import { authenticate, type Principal } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { exercisePatchSchema } from "@/lib/validation";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * The exercise, if this principal may change it: their own movement, or — for
 * an admin — the shared catalogue. Somebody else's movement is not found.
 */
async function editableExercise(principal: Principal, id: string) {
  const exercise = await prisma.exercise.findUnique({
    where: { id },
    include: { _count: { select: { entries: true } } },
  });
  if (!exercise) throw notFound("Exercise");
  if (exercise.ownerId === principal.user.id) return { exercise, shared: false };
  if (exercise.ownerId !== null) throw notFound("Exercise");
  if (principal.user.role !== "admin") {
    throw new ApiError(
      "The shared catalogue is edited by an administrator. You can hide a movement from your own suggestions instead.",
      403,
      "admin-only",
    );
  }
  return { exercise, shared: true };
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const principal = await authenticate(request, { scope: "entries:write" });
    const { id } = await params;
    const input = exercisePatchSchema.parse(await request.json());
    const { exercise, shared } = await editableExercise(principal, id);

    if (input.name) {
      const slug = slugify(input.name);
      const clash = await prisma.exercise.findFirst({
        where: { slug, ownerId: exercise.ownerId, id: { not: exercise.id } },
        select: { id: true },
      });
      if (clash) throw new ApiError(`"${input.name}" already exists`, 409);
    }

    const { muscles, name, ...fields } = input;
    const updated = await prisma.exercise.update({
      where: { id: exercise.id },
      data: {
        ...fields,
        name: name?.trim(),
        slug: name ? slugify(name) : undefined,
        // Muscle weightings are replaced wholesale, not merged — a partial
        // merge would silently keep mappings the user meant to remove.
        muscles: muscles ? { deleteMany: {}, create: muscles } : undefined,
      },
      include: { muscles: true },
    });

    if (shared) {
      await audit("admin.catalogue_updated", {
        actorId: principal.user.id,
        request,
        detail: { exerciseId: exercise.id, name: exercise.name, fields: Object.keys(input) },
      });
    }
    return { exercise: updated };
  });
}

/**
 * Archive rather than delete: entries reference the exercise, and destroying it
 * would silently rewrite somebody's training history. Only a movement nobody
 * has ever logged is removed outright.
 */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const principal = await authenticate(request, { scope: "entries:write" });
    const { id } = await params;
    const { exercise, shared } = await editableExercise(principal, id);

    const removed = exercise._count.entries === 0 ? "deleted" : "archived";
    if (removed === "deleted") await prisma.exercise.delete({ where: { id: exercise.id } });
    else await prisma.exercise.update({ where: { id: exercise.id }, data: { archived: true } });

    if (shared) {
      await audit("admin.catalogue_updated", {
        actorId: principal.user.id,
        request,
        detail: { exerciseId: exercise.id, name: exercise.name, removed },
      });
    }
    return { removed, entries: exercise._count.entries };
  });
}
