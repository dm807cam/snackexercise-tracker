import { NextRequest } from "next/server";
import { z } from "zod";
import { handle, notFound } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { findVisibleExercise } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({ blocked: z.boolean() });

/**
 * PUT /api/exercises/:id/preference — "never suggest this" (or undo it). Only
 * about this user's suggestions: the movement stays loggable and stays in the
 * catalogue for everyone else.
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const { id } = await params;
    const { blocked } = bodySchema.parse(await request.json());
    if (!(await findVisibleExercise(user.id, id))) throw notFound("Exercise");

    const preference = await prisma.exercisePreference.upsert({
      where: { userId_exerciseId: { userId: user.id, exerciseId: id } },
      create: { userId: user.id, exerciseId: id, blocked },
      update: { blocked },
    });
    return { preference };
  });
}
