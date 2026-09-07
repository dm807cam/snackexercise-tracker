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
  /** Metres. A marathon is 42,195; the cap allows an ultra without allowing a typo. */
  distanceM: z.number().min(0).max(300000).nullish(),
  avgHeartRate: z.number().int().min(20).max(250).nullish(),
  notes: z.string().max(500).nullish(),
  source: z.enum(["manual", "llm"]).default("manual"),
  /** Muscle mapping used only when creating a new custom exercise by name. */
  muscles: z.array(muscleWeightSchema).min(1).max(19).optional(),
  /** Likewise: how aerobic a brand-new movement is, and its typical cost. */
  cardioBias: z.number().min(0).max(1).optional(),
  mets: z.number().min(1).max(23).nullish(),
}).refine((v) => v.exerciseId || v.exerciseName, {
  message: "Provide either exerciseId or exerciseName",
});

export const entryUpdateSchema = z.object({
  sets: z.number().int().min(1).max(200).optional(),
  reps: z.number().int().min(1).max(10000).nullish(),
  weightKg: z.number().min(0).max(1000).nullish(),
  durationSec: z.number().int().min(1).max(86400).nullish(),
  distanceM: z.number().min(0).max(300000).nullish(),
  avgHeartRate: z.number().int().min(20).max(250).nullish(),
  notes: z.string().max(500).nullish(),
  performedAt: z.string().datetime({ offset: true }).optional(),
});

/**
 * Fields of an exercise, without defaults.
 *
 * Kept separate from exerciseInputSchema because `.partial()` does NOT strip
 * `.default()` — a defaulted field is already optional on input, so partial
 * wraps it and the default still fires. A PATCH carrying only `{muscles}`
 * (which is exactly what the Settings muscle editor sends) would therefore
 * arrive at Prisma carrying cardioBias 0, category "other" and bodyweight
 * false, silently resetting all three. For cardioBias that is not a cosmetic
 * reset: editing Run's muscle mapping would turn every run in the history into
 * full strength volume and zero its MET-minutes.
 */
const exerciseFieldsSchema = z.object({
  name: z.string().min(1).max(80),
  category: z.enum([
    "barbell",
    "dumbbell",
    "kettlebell",
    "bodyweight",
    "machine",
    "odd-object",
    "cardio",
    "other",
  ]),
  bodyweight: z.boolean(),
  /** 0 pure resistance, 1 pure cardio. See lib/cardio.ts. */
  cardioBias: z.number().min(0).max(1),
  mets: z.number().min(1).max(23).nullish(),
  muscles: z.array(muscleWeightSchema).min(1).max(19),
});

/** Creating an exercise: defaults apply, only name and muscles are required. */
export const exerciseInputSchema = exerciseFieldsSchema.extend({
  category: exerciseFieldsSchema.shape.category.default("other"),
  bodyweight: z.boolean().default(false),
  cardioBias: z.number().min(0).max(1).default(0),
});

/** Updating one: every field optional, and an absent field stays absent. */
export const exercisePatchSchema = exerciseFieldsSchema.partial();

/**
 * A day's measurements. Steps are capped at a number no human reaches on foot;
 * anything above it is a unit mix-up or a broken sensor, and silently storing
 * it would distort the balance marker for the whole window.
 */
export const dailyMetricSchema = z.object({
  steps: z.number().int().min(0).max(200000).nullish(),
  source: z.enum(["manual", "shortcut", "import", "llm"]).default("manual"),
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
  timezone: z.string().max(64).optional(),
  /** How much walking counts toward the cardio side. See lib/cardio.ts. */
  stepsMode: z.enum(["off", "half", "full"]).optional(),
  /**
   * Steps below this are ordinary living rather than training. Empty string
   * means "work it out from my own quiet days", which is the default.
   */
  stepBaseline: z.string().max(10).optional(),
});
