import { z } from "zod";
import { MUSCLE_SLUGS } from "./muscles";
import { isValidLocalDate } from "./dates";
import { EFFORT_LEVELS } from "./effort";

export const localDateSchema = z.string().refine(isValidLocalDate, {
  message: "Expected a valid YYYY-MM-DD date",
});

/** 24-hour "HH:MM" — the value an <input type="time"> produces. */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "Expected a time as HH:MM" });

/**
 * How close the set was to failure. Optional everywhere: the app would rather
 * have an unrated set than no set, and lib/effort.ts says what an unrated one
 * is worth.
 */
export const effortSchema = z.enum(EFFORT_LEVELS);

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
  /**
   * "HH:MM" on the app's own wall clock, paired with `localDate`.
   *
   * Preferred over `performedAt` for anything a human typed. The browser may be
   * in a different zone from the one the app is configured for, so an instant
   * built there can land an hour out — or on the wrong day — for anyone
   * travelling. Sending the digits and resolving them server-side against the
   * configured zone is the only form that survives that.
   */
  performedTime: timeOfDaySchema.optional(),
  localDate: localDateSchema.optional(),
  sets: z.number().int().min(1).max(200).default(1),
  reps: z.number().int().min(1).max(10000).nullish(),
  weightKg: z.number().min(0).max(1000).nullish(),
  durationSec: z.number().int().min(1).max(86400).nullish(),
  /** Metres. A marathon is 42,195; the cap allows an ultra without allowing a typo. */
  distanceM: z.number().min(0).max(300000).nullish(),
  avgHeartRate: z.number().int().min(20).max(250).nullish(),
  effort: effortSchema.nullish(),
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
  effort: effortSchema.nullish(),
  notes: z.string().max(500).nullish(),
  performedAt: z.string().datetime({ offset: true }).optional(),
  /** Move an entry to a different clock time — see `performedTime` above. */
  performedTime: timeOfDaySchema.optional(),
  /** The day that time belongs to. Defaults to the entry's existing day. */
  localDate: localDateSchema.optional(),
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
  /**
   * The hours the spacing metric scores a day against — when the user is
   * normally up and about. Stored as strings like every other setting.
   */
  dayStartHour: z.string().max(2).optional(),
  dayEndHour: z.string().max(2).optional(),
  /**
   * Hard sets per muscle per week to aim at — the radar's absolute reference.
   * Empty means the literature default; see lib/volume.ts.
   */
  perMuscleTarget: z.string().max(3).optional(),
  /**
   * The weekly doses each side is measured against. Empty means the
   * public-health guideline, which is the default; see lib/targets.ts.
   */
  cardioTarget: z.string().max(5).optional(),
  strengthTarget: z.string().max(4).optional(),
});
