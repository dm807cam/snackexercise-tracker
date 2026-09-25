import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { authenticate } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { MUSCLE_SLUGS } from "@/lib/muscles";
import { findVisibleExerciseBySlug, putSetting } from "@/lib/queries";
import { effortSchema, localDateSchema, settingsSchema, snackProfileSchema } from "@/lib/validation";
import { slugify } from "@/lib/slug";
import { isContextKind } from "@/lib/snack/contexts";
import { formatEquipmentList } from "@/lib/snack/equipment";

export const dynamic = "force-dynamic";

/** Twenty megabytes is a decade of daily logging several times over. */
const MAX_BODY_BYTES = 20 * 1024 * 1024;

/**
 * Accepts every export format.
 *
 * Version 1 predates cardio, so its files carry no cardioBias, no distance and
 * no daily metrics; version 2 predates the per-entry effort rating; version 5
 * adds snack profiles, places and busy times. Rather than a schema per version,
 * the new fields default: a v1 exercise restores at bias 0, which is exactly
 * what it was — resistance work — a v2 entry restores with no effort rating,
 * and a v3 day restores with no brisk minutes. Each is exactly what it had. An
 * old backup must never stop restoring because the app grew.
 */
const importSchema = z.object({
  version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  exercises: z
    .array(
      z
        .object({
          slug: z.string().min(1).max(100),
          name: z.string().min(1).max(80),
          category: z.string().max(20).default("other"),
          bodyweight: z.boolean().default(false),
          cardioBias: z.number().min(0).max(1).default(0),
          mets: z.number().min(1).max(23).nullish(),
          isCustom: z.boolean().default(false),
          archived: z.boolean().default(false),
          muscles: z
            .array(
              z.object({
                muscle: z.enum(MUSCLE_SLUGS as unknown as [string, ...string[]]),
                weight: z.number().positive().max(1),
              }),
            )
            .max(19),
        })
        .extend(snackProfileSchema.partial().shape),
    )
    .max(5000),
  entries: z
    .array(
      z.object({
        exerciseSlug: z.string().min(1).nullable(),
        performedAt: z.string().datetime({ offset: true }),
        localDate: localDateSchema,
        sets: z.number().int().min(1).max(200),
        reps: z.number().int().nullable(),
        weightKg: z.number().nullable(),
        durationSec: z.number().int().nullable(),
        distanceM: z.number().nullish(),
        avgHeartRate: z.number().int().nullish(),
        effort: effortSchema.nullish(),
        notes: z.string().max(500).nullable(),
        source: z.string().max(20),
      }),
    )
    .max(500_000),
  dailyMetrics: z
    .array(
      z.object({
        localDate: localDateSchema,
        steps: z.number().int().min(0).max(200000).nullish(),
        activeMinutes: z.number().int().min(0).max(1440).nullish(),
        source: z.string().max(20).default("import"),
      }),
    )
    .max(50_000)
    .optional(),
  settings: z.record(z.string(), z.string()).optional(),
  contexts: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        kind: z.string().max(20),
        equipment: z.string().max(500),
        quiet: z.boolean(),
        floor: z.boolean(),
        sweat: z.number().int().min(0).max(2),
      }),
    )
    .max(50)
    .optional(),
  busyBlocks: z
    .array(
      z.object({
        days: z.number().int().min(1).max(127),
        startMin: z.number().int().min(0).max(1440),
        endMin: z.number().int().min(0).max(1440),
        label: z.string().max(60).nullish(),
      }),
    )
    .max(100)
    .optional(),
});

/**
 * Restore from an export into the SIGNED-IN account. Additive by default:
 * existing exercises are reused by slug and entries are appended. `replace`
 * wipes this account's log first, for restoring onto a fresh account.
 *
 * A movement the file carries that this account cannot see becomes one of its
 * own custom movements — never part of the shared catalogue, which an import
 * by any member could otherwise rewrite for everybody.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) throw new ApiError("That file is too large to import (20 MB at most).", 413);

    const replace = new URL(request.url).searchParams.get("mode") === "replace";
    const data = importSchema.parse(await request.json());

    if (replace) {
      await prisma.setEntry.deleteMany({ where: { userId: user.id } });
      await prisma.dailyMetric.deleteMany({ where: { userId: user.id } });
    }

    // Every referenced exercise resolved to one this account can use.
    const idBySlug = new Map<string, string>();
    for (const exercise of data.exercises) {
      const slug = slugify(exercise.slug) || slugify(exercise.name);
      if (!slug) continue;
      const existing = await findVisibleExerciseBySlug(user.id, slug);
      if (existing) {
        idBySlug.set(exercise.slug, existing.id);
        continue;
      }
      if (exercise.muscles.length === 0) continue;
      const created = await prisma.exercise.create({
        data: {
          ownerId: user.id,
          slug,
          name: exercise.name,
          category: exercise.category,
          bodyweight: exercise.bodyweight,
          cardioBias: exercise.cardioBias,
          mets: exercise.mets ?? null,
          isCustom: true,
          archived: exercise.archived,
          equipment: exercise.equipment ?? null,
          load: exercise.load ?? null,
          impact: exercise.impact ?? null,
          floor: exercise.floor ?? null,
          sweat: exercise.sweat ?? null,
          snackReps: exercise.snackReps ?? null,
          snackSeconds: exercise.snackSeconds ?? null,
          unilateral: exercise.unilateral ?? null,
          cues: exercise.cues ?? null,
          muscles: { create: exercise.muscles },
        },
      });
      idBySlug.set(exercise.slug, created.id);
    }

    let imported = 0;
    let skipped = 0;
    for (const entry of data.entries) {
      const exerciseId = entry.exerciseSlug ? idBySlug.get(entry.exerciseSlug) : undefined;
      if (!exerciseId) {
        skipped += 1;
        continue;
      }

      // Skip an entry that is already present, so re-importing the same file
      // does not silently double your history.
      const duplicate = await prisma.setEntry.findFirst({
        where: {
          userId: user.id,
          exerciseId,
          performedAt: new Date(entry.performedAt),
          sets: entry.sets,
          reps: entry.reps,
        },
        select: { id: true },
      });
      if (duplicate) {
        skipped += 1;
        continue;
      }

      await prisma.setEntry.create({
        data: {
          userId: user.id,
          exerciseId,
          performedAt: new Date(entry.performedAt),
          localDate: entry.localDate,
          sets: entry.sets,
          reps: entry.reps,
          weightKg: entry.weightKg,
          durationSec: entry.durationSec,
          distanceM: entry.distanceM ?? null,
          avgHeartRate: entry.avgHeartRate ?? null,
          effort: entry.effort ?? null,
          notes: entry.notes,
          source: entry.source,
        },
      });
      imported += 1;
    }

    // Days are a measurement, not a log, so there is nothing to de-duplicate:
    // the later file simply carries the more recent reading for that date.
    let metrics = 0;
    for (const day of data.dailyMetrics ?? []) {
      await prisma.dailyMetric.upsert({
        where: { userId_localDate: { userId: user.id, localDate: day.localDate } },
        create: {
          userId: user.id,
          localDate: day.localDate,
          steps: day.steps ?? null,
          activeMinutes: day.activeMinutes ?? null,
          source: day.source,
        },
        // A v1-v3 file carries no brisk minutes at all, so restoring one must
        // leave any already recorded alone rather than writing null over them.
        update: {
          steps: day.steps ?? null,
          source: day.source,
          ...(day.activeMinutes === undefined ? {} : { activeMinutes: day.activeMinutes }),
        },
      });
      metrics += 1;
    }

    // Only settings the app still understands, each validated as if typed in
    // Settings; credentials never come in from a file.
    const settings = settingsSchema.safeParse(data.settings ?? {});
    if (settings.success) {
      for (const [key, value] of Object.entries(settings.data)) {
        if (value === undefined || key === "openrouterKey") continue;
        await putSetting(user.id, key, value);
      }
    }

    let places = 0;
    for (const context of data.contexts ?? []) {
      const exists = await prisma.trainingContext.findUnique({
        where: { userId_name: { userId: user.id, name: context.name } },
        select: { id: true },
      });
      if (exists) continue;
      await prisma.trainingContext.create({
        data: {
          userId: user.id,
          name: context.name,
          kind: isContextKind(context.kind) ? context.kind : "other",
          equipment: formatEquipmentList(context.equipment.split(/\s+/)),
          quiet: context.quiet,
          floor: context.floor,
          sweat: context.sweat,
        },
      });
      places += 1;
    }

    for (const block of data.busyBlocks ?? []) {
      if (block.endMin <= block.startMin) continue;
      const exists = await prisma.busyBlock.findFirst({
        where: { userId: user.id, days: block.days, startMin: block.startMin, endMin: block.endMin },
        select: { id: true },
      });
      if (!exists) await prisma.busyBlock.create({ data: { userId: user.id, ...block, label: block.label ?? null } });
    }

    await audit("account.imported", {
      actorId: user.id,
      request,
      detail: { imported, skipped, metrics, places, replaced: replace, version: data.version },
    });
    return { imported, skipped, metrics, places, replaced: replace };
  });
}
