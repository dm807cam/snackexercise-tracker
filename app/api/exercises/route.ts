import { NextRequest } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { findVisibleExerciseBySlug, getExercises, getRecentExerciseIds } from "@/lib/queries";
import { exerciseInputSchema } from "@/lib/validation";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    const [exercises, recentIds] = await Promise.all([
      getExercises(user.id),
      getRecentExerciseIds(user.id),
    ]);
    return { exercises, recentIds };
  });
}

/**
 * POST /api/exercises — add a movement of your own. It is yours: nobody else on
 * the instance sees it. Adding to the shared catalogue is an admin's job, done
 * with `shared: true`.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const body = await request.json();
    const input = exerciseInputSchema.parse(body);
    const shared = body?.shared === true;
    if (shared && user.role !== "admin") {
      throw new ApiError("Only an administrator can add to the shared catalogue", 403, "admin-only");
    }

    const slug = slugify(input.name);
    if (!slug) throw new ApiError("Exercise name must contain letters or numbers");
    const existing = shared
      ? await prisma.exercise.findFirst({ where: { ownerId: null, slug } })
      : await findVisibleExerciseBySlug(user.id, slug);
    if (existing) throw new ApiError(`"${existing.name}" already exists`, 409);

    const { muscles, name, ...fields } = input;
    return {
      exercise: await prisma.exercise.create({
        data: {
          ...fields,
          ownerId: shared ? null : user.id,
          name: name.trim(),
          slug,
          mets: fields.mets ?? null,
          isCustom: true,
          muscles: { create: muscles },
        },
        include: { muscles: true },
      }),
    };
  });
}
