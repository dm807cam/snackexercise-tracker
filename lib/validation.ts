import { z } from "zod";
import { MUSCLE_SLUGS } from "./muscles";
import { isValidLocalDate } from "./dates";

export const localDateSchema = z.string().refine(isValidLocalDate, {
  message: "Expected a valid YYYY-MM-DD date",
});

export const muscleWeightSchema = z.object({
  muscle: z.enum(MUSCLE_SLUGS as unknown as [string, ...string[]]),
  weight: z.number().positive().max(1),
});

/**
 * Reps, weight and duration are all optional: the point of the app is that you
 * can log "did some pull-ups" without being forced to invent numbers.
 */
export const entryInputSchema = z.object({
  exerciseId: z.string().min(1).optional(),
  exerciseName: z.string().min(1).max(80).optional(),
  performedAt: z.string().datetime({ offset: true }).optional(),
  localDate: localDateSchema.optional(),
  sets: z.number().int().min(1).max(200).default(1),
  reps: z.number().int().min(1).max(10000).nullish(),
  weightKg: z.number().min(0).max(1000).nullish(),
  durationSec: z.number().int().min(1).max(86400).nullish(),
  notes: z.string().max(500).nullish(),
  source: z.enum(["manual", "llm"]).default("manual"),
  /** Muscle mapping used only when creating a new custom exercise by name. */
  muscles: z.array(muscleWeightSchema).min(1).max(19).optional(),
}).refine((v) => v.exerciseId || v.exerciseName, {
  message: "Provide either exerciseId or exerciseName",
});

export const entryUpdateSchema = z.object({
  sets: z.number().int().min(1).max(200).optional(),
  reps: z.number().int().min(1).max(10000).nullish(),
  weightKg: z.number().min(0).max(1000).nullish(),
  durationSec: z.number().int().min(1).max(86400).nullish(),
  notes: z.string().max(500).nullish(),
  performedAt: z.string().datetime({ offset: true }).optional(),
});

export const exerciseInputSchema = z.object({
  name: z.string().min(1).max(80),
  category: z
    .enum(["barbell", "dumbbell", "kettlebell", "bodyweight", "machine", "odd-object", "other"])
    .default("other"),
  bodyweight: z.boolean().default(false),
  muscles: z.array(muscleWeightSchema).min(1).max(19),
});

export const STATS_WINDOWS = [7, 30, 60, 90, 180] as const;
export const statsWindowSchema = z.coerce
  .number()
  .refine((n): n is (typeof STATS_WINDOWS)[number] => STATS_WINDOWS.includes(n as never), {
    message: `Window must be one of ${STATS_WINDOWS.join(", ")}`,
  });

export const settingsSchema = z.object({
  openrouterKey: z.string().max(200).optional(),
  openrouterModel: z.string().max(120).optional(),
  units: z.enum(["kg", "lb"]).optional(),
  bodyweightKg: z.string().max(10).optional(),
});
