import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { MUSCLE_SLUGS } from "@/lib/muscles";
import { localDateSchema } from "@/lib/validation";
import { slugify } from "@/lib/slug";

export const dynamic = "force-dynamic";

const importSchema = z.object({
  version: z.literal(1),
  exercises: z.array(
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      category: z.string().default("other"),
      bodyweight: z.boolean().default(false),
      isCustom: z.boolean().default(false),
      archived: z.boolean().default(false),
      muscles: z.array(
        z.object({
          muscle: z.enum(MUSCLE_SLUGS as unknown as [string, ...string[]]),
          weight: z.number().positive().max(1),
        }),
      ),
    }),
  ),
  entries: z.array(
    z.object({
      exerciseSlug: z.string().min(1),
      performedAt: z.string().datetime({ offset: true }),
      localDate: localDateSchema,
      sets: z.number().int().min(1),
      reps: z.number().int().nullable(),
      weightKg: z.number().nullable(),
      durationSec: z.number().int().nullable(),
      notes: z.string().nullable(),
      source: z.string(),
    }),
  ),
  settings: z.record(z.string(), z.string()).optional(),
});

/**
 * Restore from an export. Additive by default: existing exercises are reused by
 * slug and entries are appended. `replace` wipes the log first, for restoring
 * onto a machine that already has partial data.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await request.json();
    const replace = new URL(request.url).searchParams.get("mode") === "replace";
    const data = importSchema.parse(body);

    if (replace) await prisma.setEntry.deleteMany({});

    // Ensure every referenced exercise exists, keyed by slug.
    const idBySlug = new Map<string, string>();
    for (const exercise of data.exercises) {
      const slug = slugify(exercise.slug) || slugify(exercise.name);
      const existing = await prisma.exercise.findUnique({ where: { slug } });
      if (existing) {
        idBySlug.set(exercise.slug, existing.id);
        continue;
      }
      const created = await prisma.exercise.create({
        data: {
          slug,
          name: exercise.name,
          category: exercise.category,
          bodyweight: exercise.bodyweight,
          isCustom: exercise.isCustom,
          archived: exercise.archived,
          muscles: { create: exercise.muscles },
        },
      });
      idBySlug.set(exercise.slug, created.id);
    }

    let imported = 0;
    let skipped = 0;
    for (const entry of data.entries) {
      const exerciseId = idBySlug.get(entry.exerciseSlug);
      if (!exerciseId) {
        skipped += 1;
        continue;
      }

      // Skip an entry that is already present, so re-importing the same file
      // does not silently double your history.
      const duplicate = await prisma.setEntry.findFirst({
        where: {
          exerciseId,
          performedAt: new Date(entry.performedAt),
          sets: entry.sets,
          reps: entry.reps,
        },
      });
      if (duplicate) {
        skipped += 1;
        continue;
      }

      await prisma.setEntry.create({
        data: {
          exerciseId,
          performedAt: new Date(entry.performedAt),
          localDate: entry.localDate,
          sets: entry.sets,
          reps: entry.reps,
          weightKg: entry.weightKg,
          durationSec: entry.durationSec,
          notes: entry.notes,
          source: entry.source,
        },
      });
      imported += 1;
    }

    for (const [key, value] of Object.entries(data.settings ?? {})) {
      if (key === "openrouterKey") continue;
      await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }

    return { imported, skipped, replaced: replace };
  });
}
