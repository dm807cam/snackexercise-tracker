import { NextRequest, NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { exercisePatchSchema } from "@/lib/validation";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const input = exercisePatchSchema.parse(await request.json());

    const existing = await prisma.exercise.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Exercise not found", 404);

    return {
      exercise: await prisma.exercise.update({
        where: { id },
        data: {
          name: input.name?.trim(),
          slug: input.name ? slugify(input.name) : undefined,
          category: input.category,
          bodyweight: input.bodyweight,
          cardioBias: input.cardioBias,
          mets: input.mets,
          // Muscle weightings are replaced wholesale, not merged — a partial
          // merge would silently keep mappings the user meant to remove.
          muscles: input.muscles
            ? { deleteMany: {}, create: input.muscles }
            : undefined,
        },
        include: { muscles: true },
      }),
    };
  });
}

/**
 * Archive rather than delete: entries reference the exercise, and destroying it
 * would silently rewrite your training history.
 */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const existing = await prisma.exercise.findUnique({
    where: { id },
    include: { _count: { select: { entries: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Exercise not found" }, { status: 404 });

  if (existing._count.entries === 0) {
    await prisma.exercise.delete({ where: { id } });
    return NextResponse.json({ removed: "deleted" });
  }

  await prisma.exercise.update({ where: { id }, data: { archived: true } });
  return NextResponse.json({ removed: "archived", entries: existing._count.entries });
}
