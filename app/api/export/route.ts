import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Full JSON export. Deliberately includes the exercise catalogue and its muscle
 * weightings alongside the entries — entries alone would be meaningless on
 * restore, since the body map and radar are computed from those weightings.
 * The OpenRouter key is excluded: a backup file should not carry a credential.
 *
 * Version 2 adds the cardio weightings, the per-entry distance and heart rate,
 * and the daily metrics. Same reasoning as the muscle weightings: without
 * cardioBias and mets, restored entries could not reproduce the balance marker.
 * Version 3 adds the per-entry effort rating, which scales effective sets and
 * so is likewise needed to reproduce them; version 4 adds each day's brisk
 * minutes, which decide how much of its walking is credited at the brisk rate.
 * The v1, v2 and v3 readers are kept in the import route, so an old backup
 * still restores.
 */
export async function GET() {
  const [exercises, entries, settings, dailyMetrics] = await Promise.all([
    prisma.exercise.findMany({
      include: { muscles: { select: { muscle: true, weight: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.setEntry.findMany({ orderBy: { performedAt: "asc" } }),
    prisma.setting.findMany(),
    prisma.dailyMetric.findMany({ orderBy: { localDate: "asc" } }),
  ]);

  const payload = {
    version: 4,
    exportedAt: new Date().toISOString(),
    exercises: exercises.map((e) => ({
      slug: e.slug,
      name: e.name,
      category: e.category,
      bodyweight: e.bodyweight,
      cardioBias: e.cardioBias,
      mets: e.mets,
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
      distanceM: e.distanceM,
      avgHeartRate: e.avgHeartRate,
      effort: e.effort,
      notes: e.notes,
      source: e.source,
    })),
    dailyMetrics: dailyMetrics.map((m) => ({
      localDate: m.localDate,
      steps: m.steps,
      activeMinutes: m.activeMinutes,
      source: m.source,
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
