import { NextRequest } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getExercises, getRecentExerciseIds } from "@/lib/queries";
import { exerciseInputSchema } from "@/lib/validation";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

export async function GET() {
  return handle(async () => {
    const [exercises, recentIds] = await Promise.all([getExercises(), getRecentExerciseIds()]);
    return { exercises, recentIds };
  });
}

export async function POST(request: NextRequest) {
  return handle(async () => {
    const input = exerciseInputSchema.parse(await request.json());
    const slug = slugify(input.name);

    const existing = await prisma.exercise.findUnique({ where: { slug } });
    if (existing) throw new ApiError(`"${existing.name}" already exists`, 409);

    return {
      exercise: await prisma.exercise.create({
        data: {
          name: input.name.trim(),
          slug,
          category: input.category,
          bodyweight: input.bodyweight,
          isCustom: true,
          muscles: { create: input.muscles },
        },
        include: { muscles: true },
      }),
    };
  });
}
