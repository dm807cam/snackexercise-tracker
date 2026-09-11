import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { getExercises, getSetting } from "@/lib/queries";
import { DEFAULT_MODEL, OpenRouterError, parseWorkoutText, suggestMuscles } from "@/lib/openrouter";
import { slugify } from "@/lib/slug";
import { localDateSchema } from "@/lib/validation";
import { formatTime, todayLocalDate } from "@/lib/dates";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  text: z.string().min(2).max(2000),
  date: localDateSchema.optional(),
});

export interface ProposedEntry {
  exerciseName: string;
  matchedExerciseId: string | null;
  matchedName: string | null;
  sets: number;
  reps: number | null;
  weightKg: number | null;
  durationSec: number | null;
  distanceM: number | null;
  avgHeartRate: number | null;
  /** "easy" | "hard" | "failure" if the speaker said so, else null. */
  effort: string | null;
  timeHint: string | null;
  notes: string | null;
  /** Only present when the movement is new and needs adding to the catalogue. */
  suggestedMuscles: { muscle: string; weight: number }[] | null;
  /** How aerobic the model thinks a new movement is, 0..1. */
  suggestedCardioBias: number | null;
  suggestedMets: number | null;
  /** True once the entry is known to be at least partly cardio. */
  isCardio: boolean;
}

/**
 * POST /api/parse — text in, proposed entries out. Deliberately read-only:
 * the client shows these for confirmation and then posts to /api/entries, and
 * a proposed step count to /api/metrics.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { text, date } = requestSchema.parse(await request.json());

    const apiKey = await getSetting("openrouterKey");
    if (!apiKey) {
      throw new ApiError(
        "No OpenRouter API key configured. Add one in Settings to use voice entry.",
        412,
      );
    }
    const model = (await getSetting("openrouterModel")) ?? DEFAULT_MODEL;
    const exercises = await getExercises();

    let parsed;
    try {
      parsed = await parseWorkoutText({
        apiKey,
        model,
        text,
        knownExercises: exercises.map((e) => e.name),
        localTime: formatTime(new Date()),
      });
    } catch (error) {
      if (error instanceof OpenRouterError) throw new ApiError(error.message, error.status);
      throw error;
    }

    const bySlug = new Map(exercises.map((e) => [e.slug, e]));
    const targetDate = date ?? todayLocalDate();

    const proposals: ProposedEntry[] = [];
    for (const entry of parsed.entries) {
      const slug = slugify(entry.exerciseName);
      const matched = bySlug.get(slug) ?? fuzzyMatch(entry.exerciseName, exercises);

      // Only ask the model for a muscle mapping when the movement is genuinely
      // new — one extra call per unknown name, never for catalogue hits.
      let suggestedMuscles: { muscle: string; weight: number }[] | null = null;
      let suggestedCardioBias: number | null = null;
      let suggestedMets: number | null = null;
      if (!matched) {
        try {
          const suggestion = await suggestMuscles({
            apiKey,
            model,
            exerciseName: entry.exerciseName,
          });
          suggestedMuscles = suggestion.muscles;
          suggestedCardioBias = suggestion.cardioBias;
          suggestedMets = suggestion.mets;
        } catch {
          // A failed suggestion is not fatal: the user can map it by hand.
          suggestedMuscles = null;
        }
      }

      proposals.push({
        exerciseName: entry.exerciseName,
        matchedExerciseId: matched?.id ?? null,
        matchedName: matched?.name ?? null,
        sets: entry.sets,
        reps: entry.reps,
        weightKg: entry.weightKg,
        durationSec: entry.durationSec,
        distanceM: entry.distanceM,
        avgHeartRate: entry.avgHeartRate,
        effort: entry.effort ?? null,
        timeHint: entry.timeHint,
        notes: entry.notes,
        suggestedMuscles,
        suggestedCardioBias,
        suggestedMets,
        isCardio: (matched?.cardioBias ?? suggestedCardioBias ?? 0) > 0,
      });
    }

    // Steps ride along on the same dictation but do not become an entry — they
    // are a measurement of the day, so they take a different path into the
    // database. They are still only PROPOSED here: this endpoint is read-only,
    // the sheet promises "nothing is stored until you confirm", and a misheard
    // "eleven thousand" silently overwriting a phone automation's number would
    // be exactly the failure that promise exists to prevent.
    return { date: targetDate, proposals, steps: parsed.steps };
  });
}

/**
 * Fall back to a containment match so "swings" finds "Kettlebell swing".
 * Only accepts an unambiguous single candidate — guessing between two is worse
 * than asking, because the user is about to confirm this anyway.
 */
function fuzzyMatch(
  name: string,
  exercises: Awaited<ReturnType<typeof getExercises>>,
): (typeof exercises)[number] | null {
  const needle = slugify(name).replace(/-/g, " ").trim();
  if (needle.length < 3) return null;

  const candidates = exercises.filter((e) => {
    const hay = e.slug.replace(/-/g, " ");
    return hay.includes(needle) || needle.includes(hay);
  });

  if (candidates.length !== 1) return null;
  return candidates[0];
}
