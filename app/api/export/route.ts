import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { authenticate } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";

/** Settings that are credentials, or ids that mean nothing in another database. */
const NOT_EXPORTED = new Set(["openrouterKey", "activeContextId", "defaultContextId"]);

/**
 * Full JSON export of ONE account. Deliberately includes the exercise catalogue
 * and its muscle weightings alongside the entries — entries alone would be
 * meaningless on restore, since the body map and radar are computed from those
 * weightings. Credentials are excluded: a backup file should not carry one.
 *
 * Version 2 adds the cardio weightings, the per-entry distance and heart rate,
 * and the daily metrics. Same reasoning as the muscle weightings: without
 * cardioBias and mets, restored entries could not reproduce the balance marker.
 * Version 3 adds the per-entry effort rating, which scales effective sets and
 * so is likewise needed to reproduce them; version 4 adds each day's brisk
 * minutes, which decide how much of its walking is credited at the brisk rate.
 * Version 5 is per account, and adds the snack profiles, the user's places and
 * their busy times. The v1-v4 readers are kept in the import route, so an old
 * backup still restores.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    const { today } = await getAppConfig(user.id);

    const [exercises, entries, settings, dailyMetrics, contexts, busyBlocks] = await Promise.all([
      prisma.exercise.findMany({
        where: { OR: [{ ownerId: null }, { ownerId: user.id }] },
        include: { muscles: { select: { muscle: true, weight: true } } },
        orderBy: { name: "asc" },
      }),
      prisma.setEntry.findMany({ where: { userId: user.id }, orderBy: { performedAt: "asc" } }),
      prisma.setting.findMany({ where: { userId: user.id } }),
      prisma.dailyMetric.findMany({ where: { userId: user.id }, orderBy: { localDate: "asc" } }),
      prisma.trainingContext.findMany({ where: { userId: user.id }, orderBy: { sortOrder: "asc" } }),
      prisma.busyBlock.findMany({ where: { userId: user.id } }),
    ]);

    // Re-key entries by exercise slug so the file survives a restore into a
    // database that assigned different ids.
    const slugById = new Map(exercises.map((e) => [e.id, e.slug]));

    const payload = {
      version: 5,
      exportedAt: new Date().toISOString(),
      account: { email: user.email, name: user.name },
      exercises: exercises.map((e) => ({
        slug: e.slug,
        name: e.name,
        category: e.category,
        bodyweight: e.bodyweight,
        cardioBias: e.cardioBias,
        mets: e.mets,
        isCustom: e.isCustom,
        archived: e.archived,
        mine: e.ownerId === user.id,
        muscles: e.muscles,
        equipment: e.equipment,
        load: e.load,
        impact: e.impact,
        floor: e.floor,
        sweat: e.sweat,
        snackReps: e.snackReps,
        snackSeconds: e.snackSeconds,
        unilateral: e.unilateral,
        cues: e.cues,
      })),
      entries: entries.map((e) => ({
        exerciseSlug: slugById.get(e.exerciseId) ?? null,
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
        settings.filter((s) => !NOT_EXPORTED.has(s.key)).map((s) => [s.key, s.value]),
      ),
      contexts: contexts.map((c) => ({
        name: c.name,
        kind: c.kind,
        equipment: c.equipment,
        quiet: c.quiet,
        floor: c.floor,
        sweat: c.sweat,
      })),
      busyBlocks: busyBlocks.map((b) => ({ days: b.days, startMin: b.startMin, endMin: b.endMin, label: b.label })),
    };

    await audit("account.exported", { actorId: user.id, request, detail: { entries: entries.length } });
    return NextResponse.json(payload, {
      headers: {
        "content-disposition": `attachment; filename="snack-tracker-${today}.json"`,
        "cache-control": "no-store",
      },
    });
  });
}
