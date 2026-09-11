/**
 * Database reads shared by pages and API routes. Kept separate from the pure
 * scoring maths in lib/scoring.ts so that file stays trivially testable.
 */

import { cache } from "react";
import { prisma } from "./db";
import {
  type LocalDate,
  addDays,
  daysBetween,
  enumerateDates,
  minutesOfDayInZone,
  previousWindowRange,
  todayLocalDate,
  windowRange,
} from "./dates";
import type { AxisSlug } from "./muscles";
import { axisForMuscle } from "./muscles";
import {
  type ScoredEntry,
  summariseDay,
  type DaySummary,
  type MuscleTotals,
  buildStats,
  entryEffectiveSets,
  muscleCardioLoad,
  totalEffectiveSets,
  totalHardSets,
} from "./scoring";
import {
  DEFAULT_STEP_BASELINE,
  entryMetMinutes,
  impliedStepsFromEntries,
  personalStepBaseline,
  stepMetMinutes,
  type StepSettings,
  type StepsMode,
} from "./cardio";
import { buildBalance, effectiveSetEquivalents } from "./balance";
import { normalisePerMuscleTarget } from "./volume";
import {
  PROGRESSION_MAX_CARDIO_BIAS,
  buildExerciseProgress,
  type ExerciseProgress,
  type ProgressionEntry,
} from "./progression";
import {
  DEFAULT_ACTIVE_WINDOW,
  daySpacing,
  summariseSpacing,
  type ActiveWindow,
  type SpacingResult,
} from "./spacing";

/** The exercise fields every scoring path needs. */
const entryInclude = {
  exercise: {
    select: {
      id: true,
      name: true,
      // The slug identifies which pace equation applies to a cardio movement,
      // so it travels with every scored entry rather than being looked up again.
      slug: true,
      bodyweight: true,
      cardioBias: true,
      mets: true,
      muscles: { select: { muscle: true, weight: true } },
    },
  },
} as const;

export type EntryWithExercise = ScoredEntry & {
  notes: string | null;
  source: string;
  distanceM: number | null;
  avgHeartRate: number | null;
  effort: string | null;
  exercise: ScoredEntry["exercise"] & {
    slug: string;
    bodyweight: boolean;
    cardioBias: number;
    mets: number | null;
  };
};

export async function getEntriesForDate(date: LocalDate): Promise<EntryWithExercise[]> {
  const rows = await prisma.setEntry.findMany({
    where: { localDate: date },
    include: entryInclude,
    orderBy: [{ performedAt: "asc" }, { createdAt: "asc" }],
  });
  return rows as unknown as EntryWithExercise[];
}

export async function getEntriesInRange(
  start: LocalDate,
  end: LocalDate,
): Promise<EntryWithExercise[]> {
  const rows = await prisma.setEntry.findMany({
    where: { localDate: { gte: start, lte: end } },
    include: entryInclude,
    orderBy: [{ performedAt: "asc" }],
  });
  return rows as unknown as EntryWithExercise[];
}

export async function getDaySummary(
  date: LocalDate,
  timeZone?: string,
): Promise<DaySummary & {
  entries: EntryWithExercise[];
  steps: number | null;
  cardioMuscles: MuscleTotals;
  metMinutes: number;
  /**
   * MET-minutes credited to the day's steps, after the baseline and the
   * de-duplication against logged foot-based cardio. Reported apart from
   * `metMinutes` so a caller can show the logged dose alone or the whole
   * cardio dose, and the day view can agree with the balance marker about
   * whether a 14,000-step day was cardio.
   */
  stepMetMinutes: number;
  /** Effective sets across every muscle — the drawing scale, summed. */
  effectiveSets: number;
  /**
   * The day's resistance DOSE, in hard sets: normalised for how many muscles
   * each movement fans out across, so the ring does not close four times faster
   * on deadlifts than on triceps extensions. See lib/scoring.ts.
   */
  hardSets: number;
  spacing: SpacingResult;
}> {
  const [entries, steps, activeWindow, stepSettings] = await Promise.all([
    getEntriesForDate(date),
    getSteps(date),
    getActiveWindow(),
    getStepSettings(),
  ]);

  const summary = summariseDay(date, entries);

  return {
    ...summary,
    entries,
    steps,
    cardioMuscles: muscleCardioLoad(entries, entryMetMinutes),
    metMinutes: Math.round(entries.reduce((sum, e) => sum + entryMetMinutes(e), 0)),
    stepMetMinutes: Math.round(
      stepMetMinutes(steps, stepSettings, impliedStepsFromEntries(entries)),
    ),
    effectiveSets: round(totalEffectiveSets(summary.muscles)),
    hardSets: round(totalHardSets(entries)),
    spacing: daySpacing(
      entries.map((e) => minutesOfDayInZone(e.performedAt, timeZone)),
      activeWindow,
    ),
  };
}

/**
 * The hours the user is normally up and about, which is the window the spacing
 * metric scores a day against.
 *
 * A default rather than a fixed constant because "spread through the day" means
 * something different to a night-shift nurse, and scoring their 22:00 session
 * as a badly timed one would make the whole metric something to ignore.
 */
export async function getActiveWindow(): Promise<ActiveWindow> {
  const settings = await getSettings();
  const startHour = Number(settings.dayStartHour);
  const endHour = Number(settings.dayEndHour);

  const start = Number.isInteger(startHour) && startHour >= 0 && startHour <= 23
    ? startHour
    : DEFAULT_ACTIVE_WINDOW.startHour;
  const end = Number.isInteger(endHour) && endHour >= 1 && endHour <= 24
    ? endHour
    : DEFAULT_ACTIVE_WINDOW.endHour;

  return end > start ? { startHour: start, endHour: end } : DEFAULT_ACTIVE_WINDOW;
}

/**
 * Hard sets per muscle per week the user is aiming at.
 *
 * Configurable for the same reason the active window is: ~10 is where the
 * dose-response is clearly established, but someone deliberately running a
 * higher-volume block should be able to say so and have the radar agree with
 * them rather than draw a permanently full polygon.
 */
export async function getPerMuscleTarget(): Promise<number> {
  const settings = await getSettings();
  return normalisePerMuscleTarget(Number(settings.perMuscleTarget));
}

/** A day's training, split by quality and totalled. All on the effective-set scale. */
export interface DayLoad {
  /** Effective sets of resistance work. */
  strength: number;
  /** The day's MET-minutes, carried onto the effective-set scale. */
  cardio: number;
  /** The two added — the day's whole dose, and what streaks and totals count. */
  total: number;
}

/**
 * Per-day training load across a range — powers the calendar.
 *
 * Effective sets alone would render a 10 km run as an empty square, so both
 * qualities are here: strength as it stands, cardio converted by the guideline
 * exchange rate in lib/balance.ts. Sharing that currency with the balance
 * marker and the radar is the point — no two views of the app can then
 * disagree about what a run was worth.
 *
 * They are returned SEPARATELY as well as summed, because the calendar colours
 * them separately: a day is washed in the strength colour and ringed in the
 * cardio one, the same convention the body map uses. `total` is what streaks,
 * active days and month totals count, and is exactly the number this function
 * used to return on its own.
 *
 * Returns only days that carry something.
 */
export async function getDailyLoad(
  start: LocalDate,
  end: LocalDate,
): Promise<Record<LocalDate, DayLoad>> {
  const [entries, stepsByDate, stepSettings] = await Promise.all([
    getEntriesInRange(start, end),
    getStepsInRange(start, end),
    getStepSettings(),
  ]);

  const byDay: Record<string, DayLoad> = {};
  const entriesByDate = new Map<string, EntryWithExercise[]>();

  for (const entry of entries) {
    const list = entriesByDate.get(entry.localDate);
    if (list) list.push(entry);
    else entriesByDate.set(entry.localDate, [entry]);
  }

  const dates = new Set([...entriesByDate.keys(), ...Object.keys(stepsByDate)]);
  for (const date of dates) {
    const dayEntries = entriesByDate.get(date) ?? [];

    let effectiveSets = 0;
    let metMinutes = 0;
    for (const entry of dayEntries) {
      effectiveSets += entryEffectiveSets(entry);
      metMinutes += entryMetMinutes(entry);
    }

    const steps = stepsByDate[date];
    if (steps != null) {
      metMinutes += stepMetMinutes(steps, stepSettings, impliedStepsFromEntries(dayEntries));
    }

    // A day at the weekly guideline pace for both qualities scores the same as
    // a day of (target / 7) effective sets did before cardio existed.
    const cardio = effectiveSetEquivalents(metMinutes);
    const total = effectiveSets + cardio;

    if (total > 0) {
      byDay[date] = {
        strength: round(effectiveSets),
        cardio: round(cardio),
        total: round(total),
      };
    }
  }

  return byDay;
}

// --- daily metrics ---------------------------------------------------------

export async function getSteps(date: LocalDate): Promise<number | null> {
  const row = await prisma.dailyMetric.findUnique({ where: { localDate: date } });
  return row?.steps ?? null;
}

export async function getStepsInRange(
  start: LocalDate,
  end: LocalDate,
): Promise<Record<LocalDate, number>> {
  const rows = await prisma.dailyMetric.findMany({
    where: { localDate: { gte: start, lte: end }, steps: { not: null } },
    select: { localDate: true, steps: true },
  });
  return Object.fromEntries(rows.map((r) => [r.localDate, r.steps as number]));
}

export async function setSteps(
  date: LocalDate,
  steps: number | null,
  source = "manual",
): Promise<void> {
  await prisma.dailyMetric.upsert({
    where: { localDate: date },
    create: { localDate: date, steps, source },
    update: { steps, source },
  });
}

/**
 * How the user wants walking counted, and from what baseline.
 *
 * The baseline defaults to their own quiet quarter over the last 90 days rather
 * than to a fixed number, because a fixed number is wrong for both a desk
 * worker and a nurse. An explicit setting always wins.
 */
export async function getStepSettings(today: LocalDate = todayLocalDate()): Promise<StepSettings> {
  const settings = await getSettings();
  const mode = (settings.stepsMode as StepsMode) ?? "half";

  const explicit = Number(settings.stepBaseline);
  if (Number.isFinite(explicit) && explicit > 0) {
    return { mode, baseline: explicit };
  }

  const history = await getStepsInRange(addDays(today, -89), today);
  return { mode, baseline: personalStepBaseline(Object.values(history)) };
}

/**
 * Per-movement progression over a window.
 *
 * One query for the whole window rather than one per movement: the progression
 * maths is pure and needs nothing but the entries, so the only reason to touch
 * the database twice would be to fetch the same rows again.
 *
 * Aerobic movements are excluded, not just pure ones: their progression is
 * pace, which the app already shows on the entry itself, and the duration
 * metric here reads longer as better — which would score an erg improving
 * 22:00 to 20:00 as a regression and then flag it stalled at its slowest time.
 * See PROGRESSION_MAX_CARDIO_BIAS.
 *
 * Archived movements are excluded too, the way they are everywhere else: a
 * movement the user has retired should not keep appearing in a list of things
 * that have stopped improving.
 */
export async function getExerciseProgress(
  start: LocalDate,
  end: LocalDate,
  today: LocalDate,
): Promise<ExerciseProgress[]> {
  const rows = await prisma.setEntry.findMany({
    where: {
      localDate: { gte: start, lte: end },
      exercise: {
        archived: false,
        cardioBias: { lte: PROGRESSION_MAX_CARDIO_BIAS },
      },
    },
    select: {
      localDate: true,
      sets: true,
      reps: true,
      weightKg: true,
      durationSec: true,
      exercise: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { localDate: "asc" },
  });

  const byExercise = new Map<
    string,
    { id: string; name: string; slug: string; entries: ProgressionEntry[] }
  >();

  for (const row of rows) {
    let bucket = byExercise.get(row.exercise.id);
    if (!bucket) {
      bucket = { ...row.exercise, entries: [] };
      byExercise.set(row.exercise.id, bucket);
    }
    bucket.entries.push({
      localDate: row.localDate,
      sets: row.sets,
      reps: row.reps,
      weightKg: row.weightKg,
      durationSec: row.durationSec,
    });
  }

  return [...byExercise.values()]
    .map((exercise) => buildExerciseProgress(exercise, today))
    .filter((progress): progress is ExerciseProgress => progress !== null)
    // Stalled movements first — they are the reason this view exists — then by
    // how much the user actually does the movement.
    .sort(
      (a, b) =>
        Number(b.stalled) - Number(a.stalled) ||
        b.weeksFlat - a.weeksFlat ||
        b.sessions - a.sessions ||
        a.name.localeCompare(b.name),
    );
}

/**
 * Most recent date each radar axis was trained, looking back over the whole
 * log. This drives the "days since last trained" table, which for unstructured
 * training is the single most actionable number in the app.
 */
export async function getLastTrainedByAxis(): Promise<Map<AxisSlug, LocalDate>> {
  // One grouped query rather than one per axis: get the latest localDate for
  // every muscle, then roll those up.
  // Pure cardio is excluded: a run's thin quads mapping must not reset the
  // "days since you trained quads" clock, which is a question about resistance
  // work. Partly-aerobic movements (burpees, swings) still count — they really
  // do train what they claim, just less of it.
  const rows = await prisma.$queryRaw<{ muscle: string; lastDate: string }[]>`
    SELECT em.muscle AS muscle, MAX(se.localDate) AS lastDate
    FROM SetEntry se
    JOIN ExerciseMuscle em ON em.exerciseId = se.exerciseId
    JOIN Exercise e ON e.id = se.exerciseId
    WHERE e.cardioBias < 1
    GROUP BY em.muscle
  `;

  const byAxis = new Map<AxisSlug, LocalDate>();
  for (const { muscle, lastDate } of rows) {
    const axis = axisForMuscle(muscle);
    if (!axis || !lastDate) continue;
    const current = byAxis.get(axis);
    if (!current || lastDate > current) byAxis.set(axis, lastDate);
  }
  return byAxis;
}

export async function getExercises() {
  return prisma.exercise.findMany({
    where: { archived: false },
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      bodyweight: true,
      cardioBias: true,
      mets: true,
      isCustom: true,
      muscles: { select: { muscle: true, weight: true } },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * The most recent day any cardio was logged. Cardio has no radar axis — the
 * radar is muscle coverage — but "you have not done cardio in nine days" is
 * exactly the question this app exists to answer, so it earns a row in the
 * "needs attention" list.
 */
export async function getLastCardioDate(): Promise<LocalDate | null> {
  const rows = await prisma.$queryRaw<{ lastDate: string | null }[]>`
    SELECT MAX(se.localDate) AS lastDate
    FROM SetEntry se
    JOIN Exercise e ON e.id = se.exerciseId
    WHERE e.cardioBias > 0
  `;
  return rows[0]?.lastDate ?? null;
}

export type ExerciseSummary = Awaited<ReturnType<typeof getExercises>>[number];

/**
 * How recently each exercise was used, so the picker can float what you
 * actually do to the top instead of making you scroll an alphabetical list.
 */
export async function getRecentExerciseIds(limit = 12): Promise<string[]> {
  const rows = await prisma.setEntry.groupBy({
    by: ["exerciseId"],
    _max: { performedAt: true },
    orderBy: { _max: { performedAt: "desc" } },
    take: limit,
  });
  return rows.map((r) => r.exerciseId);
}

/**
 * Every setting, memoised for the life of one request.
 *
 * Five callers ask for these on a single day-page render — the timezone, the
 * units, the step mode, the step baseline and the active window — and each was
 * its own table scan. React's `cache` collapses them into one without any
 * caller having to know the others exist, and it is per-request, so a change
 * saved in Settings is visible on the very next render.
 */
export const getSettings = cache(async (): Promise<Record<string, string>> => {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
});

export async function getSetting(key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

/** Earliest logged day, used to bound "days since" answers sensibly. */
export async function getFirstLoggedDate(): Promise<LocalDate | null> {
  const row = await prisma.setEntry.findFirst({
    orderBy: { localDate: "asc" },
    select: { localDate: true },
  });
  return row?.localDate ?? null;
}

/**
 * Everything the stats page needs, in one place.
 *
 * The page and /api/stats previously assembled this identically and separately,
 * which was survivable while there were three inputs and is not now there are
 * six — the two would drift and the tab you landed on would decide what the
 * numbers meant.
 */
export async function loadStats(
  windowDays: number,
  today: LocalDate = todayLocalDate(),
  timeZone?: string,
  /**
   * Whether to scan the equivalent preceding window for the radar's trend
   * overlay. The day page asks for stats only to place its suggestion, which
   * reads none of the previous-period fields, and that scan is the single
   * biggest cost on a page that re-renders after every logged set.
   */
  comparePrevious = true,
) {
  const current = windowRange(windowDays, today);
  const previous = previousWindowRange(windowDays, today);

  const [
    currentEntries,
    previousEntries,
    lastTrained,
    lastCardio,
    steps,
    stepSettings,
    activeWindow,
    perMuscleTarget,
    progress,
  ] = await Promise.all([
    getEntriesInRange(current.start, current.end),
    comparePrevious ? getEntriesInRange(previous.start, previous.end) : [],
    getLastTrainedByAxis(),
    getLastCardioDate(),
    getStepsInRange(current.start, current.end),
    getStepSettings(today),
    getActiveWindow(),
    getPerMuscleTarget(),
    // A stall is a slow signal: a movement cannot be shown as flat for nine
    // weeks by a seven-day window. So progression always looks back far enough
    // to see one, whatever window the user is reading the rest of the page on.
    getExerciseProgress(addDays(today, -(PROGRESS_WINDOW_DAYS - 1)), today, today),
  ]);

  const balance = buildBalance({
    windowDays,
    entries: currentEntries,
    stepsByDate: steps,
    stepSettings,
  });

  const minutesByDate = new Map<string, number[]>();
  for (const entry of currentEntries) {
    const minutes = minutesByDate.get(entry.localDate);
    const at = minutesOfDayInZone(entry.performedAt, timeZone);
    if (minutes) minutes.push(at);
    else minutesByDate.set(entry.localDate, [at]);
  }

  const spacing = summariseSpacing(
    [...minutesByDate].map(([date, minutes]) => [date, daySpacing(minutes, activeWindow)] as const),
    activeWindow,
  );

  return buildStats({
    windowDays,
    start: current.start,
    end: current.end,
    current: currentEntries,
    previous: previousEntries,
    lastTrained,
    today,
    balance,
    lastCardio,
    daysWithSteps: Object.keys(steps).length,
    spacing,
    perMuscleTarget,
    progress,
    // The radar's second series: MET-minutes carried onto the effective-set
    // scale by the balance module's guideline exchange rate. Converted here,
    // once, so the chart never has to know either currency.
    cardioLoadFor: (entry) => effectiveSetEquivalents(entryMetMinutes(entry)),
  });
}

/**
 * How far back progression looks, regardless of the stats window.
 *
 * Six months. A stall is defined as weeks of training without the best set
 * moving, so a seven-day window could never show one — and the whole point of
 * the signal is that it is slower than everything else on the page.
 */
export const PROGRESS_WINDOW_DAYS = 180;

export { addDays, daysBetween, enumerateDates, todayLocalDate };
export { DEFAULT_STEP_BASELINE };

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
