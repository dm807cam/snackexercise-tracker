/**
 * Entry creation, shared by the manual add form and the LLM confirm flow so
 * both go through exactly the same validation and exercise resolution.
 */

import { prisma } from "./db";
import { ApiError } from "./api";
import { slugify } from "./slug";
import { toLocalDateInZone, zonedDateTimeToInstant } from "./dates";
import { getAppConfig } from "./app-config";
import type { z } from "zod";
import type { entryInputSchema } from "./validation";

export type EntryInput = z.infer<typeof entryInputSchema>;

/**
 * Resolve an entry to an exercise id, creating a custom exercise if the name is
 * new. A new exercise needs a muscle mapping — without one the entry could
 * never contribute to the body map or radar, which is the whole point.
 */
async function resolveExerciseId(input: EntryInput): Promise<string> {
  if (input.exerciseId) {
    const found = await prisma.exercise.findUnique({ where: { id: input.exerciseId } });
    if (!found) throw new ApiError("Unknown exercise", 404);
    return found.id;
  }

  const name = input.exerciseName!.trim();
  const slug = slugify(name);
  if (!slug) throw new ApiError("Exercise name must contain letters or numbers");

  const existing = await prisma.exercise.findUnique({ where: { slug } });
  if (existing) return existing.id;

  if (!input.muscles?.length) {
    throw new ApiError(
      `"${name}" is not in the catalogue yet — supply its muscle mapping to add it`,
      422,
    );
  }

  const created = await prisma.exercise.create({
    data: {
      name,
      slug,
      // A new movement that is mostly aerobic is filed as cardio, so the manual
      // form offers it distance and heart rate next time rather than reps.
      category: (input.cardioBias ?? 0) >= 0.5 ? "cardio" : "other",
      cardioBias: input.cardioBias ?? 0,
      mets: input.mets ?? null,
      isCustom: true,
      muscles: { create: input.muscles.map((m) => ({ muscle: m.muscle, weight: m.weight })) },
    },
  });
  return created.id;
}

export async function createEntry(input: EntryInput) {
  const exerciseId = await resolveExerciseId(input);

  // performedAt drives ordering within the day; localDate drives which day it
  // belongs to. If only one is given, derive the other rather than guessing.
  const { timeZone } = await getAppConfig();

  // The day the time belongs to. The two are independently optional on the
  // wire, so a time sent without a day means today — requiring both would
  // silently stamp "now" over a time the user explicitly chose.
  const localDate =
    input.localDate ??
    (input.performedTime
      ? toLocalDateInZone(new Date(), timeZone)
      : toLocalDateInZone(input.performedAt ? new Date(input.performedAt) : new Date(), timeZone));

  // A typed "HH:MM" wins over any instant sent alongside it: it is the thing
  // the user actually chose, and resolving it here means it means the same
  // clock time whatever zone the browser was in.
  const performedAt = input.performedTime
    ? zonedDateTimeToInstant(localDate, input.performedTime, timeZone)
    : input.performedAt
      ? new Date(input.performedAt)
      : new Date();

  return prisma.setEntry.create({
    data: {
      exerciseId,
      performedAt,
      localDate,
      sets: input.sets,
      reps: input.reps ?? null,
      weightKg: input.weightKg ?? null,
      durationSec: input.durationSec ?? null,
      distanceM: input.distanceM ?? null,
      avgHeartRate: input.avgHeartRate ?? null,
      notes: input.notes ?? null,
      source: input.source,
    },
    include: {
      exercise: {
        select: {
          id: true,
          name: true,
          slug: true,
          bodyweight: true,
          cardioBias: true,
          mets: true,
          muscles: { select: { muscle: true, weight: true } },
        },
      },
    },
  });
}
