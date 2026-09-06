import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Full JSON export. Deliberately includes the exercise catalogue and its muscle
 * weightings alongside the entries — entries alone would be meaningless on
 * restore, since the body map and radar are computed from those weightings.
 * The OpenRouter key is excluded: a backup file should not carry a credential.
 */
export async function GET() {
  const [exercises, entries, settings] = await Promise.all([
    prisma.exercise.findMany({
      include: { muscles: { select: { muscle: true, weight: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.setEntry.findMany({ orderBy: { performedAt: "asc" } }),
    prisma.setting.findMany(),
  ]);

  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    exercises: exercises.map((e) => ({
      slug: e.slug,
      name: e.name,
      category: e.category,
      bodyweight: e.bodyweight,
      isCustom: e.isCustom,
      archived: e.archived,
      muscles: e.muscles,
    })),
    entries: entries.map((e) => ({
      exerciseId: e.exerciseId,
      performedAt: e.performedAt.toISOString(),
      localDate: e.localDate,
      sets: e.sets,
      reps: e.reps,
      weightKg: e.weightKg,
      durationSec: e.durationSec,
      notes: e.notes,
      source: e.source,
    })),
    settings: Object.fromEntries(
      settings.filter((s) => s.key !== "openrouterKey").map((s) => [s.key, s.value]),
    ),
  };

  // Re-key entries by exercise slug so the file survives a restore into a
  // database that assigned different ids.
  const slugById = new Map(exercises.map((e) => [e.id, e.slug]));
  const entriesBySlug = payload.entries.map(({ exerciseId, ...rest }) => ({
    ...rest,
    exerciseSlug: slugById.get(exerciseId) ?? null,
  }));

  return NextResponse.json(
    { ...payload, entries: entriesBySlug },
    {
      headers: {
        "content-disposition": `attachment; filename="snack-tracker-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    },
  );
}
