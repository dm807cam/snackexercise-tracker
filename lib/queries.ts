/**
 * Database reads shared by pages and API routes. Kept separate from the pure
 * scoring maths in lib/scoring.ts so that file stays trivially testable.
 *
 * EVERY FUNCTION HERE THAT TOUCHES SOMEBODY'S DATA TAKES THEIR USER ID FIRST,
 * and filters on it. There is no ambient current user a query could forget to
 * apply: the id comes from lib/auth (a session or an API token) at the edge of
 * each route and page, and is passed down explicitly from there. A query that
 * reads SetEntry, DailyMetric or Setting without a `userId` in its `where` is a
 * bug, and the integration tests in tests/integration look for exactly that by
 * trying to read one account's data as another.
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
  type DayWalking,
  entryMetMinutes,
  entryMinutes,
  metsForEntry,
  impliedStepsFromEntries,
  personalStepBaseline,
  stepMetMinutes,
  type StepSettings,
  type StepsMode,
} from "./cardio";
import { buildBalance, effectiveSetEquivalents } from "./balance";
import { normalisePerMuscleTarget } from "./volume";
import { normaliseTargets, type Targets } from "./targets";
import {
  MAX_RESTING_HR,
  MIN_BIRTH_YEAR,
  MIN_RESTING_HR,
  classifyIntensity,
  summariseIntensity,
  type Physiology,
} from "./intensity";
import {
  PROGRESSION_MAX_CARDIO_BIAS,
  buildExerciseProgress,
  type ExerciseProgress,
  type ProgressionEntry,
} from "./progression";
import {
  DEFAULT_ACTIVE_WINDOW,
  daySpacing,
  normaliseTargetBouts,
  summariseSpacing,
  type ActiveWindow,
  type BoutEvent,
  type SpacingResult,
} from "./spacing";

/**
 * An entry as the spacing metric reads it: when it happened, and how much
 * movement it recorded.
 *
 * `durationSec` is stored PER SET, the way lib/cardio.ts reads it, so six
 * 40-second carries are four minutes of movement rather than forty seconds.
 */
function spacingEvent(timeZone: string | undefined) {
  return (entry: {
    performedAt: Date;
    sets: number;
    durationSec: number | null;
  }): BoutEvent => ({
    minuteOfDay: minutesOfDayInZone(entry.performedAt, timeZone),
    movementSec: entry.durationSec != null ? entry.durationSec * Math.max(1, entry.sets) : null,
  });
}

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

export async function getEntriesForDate(
  userId: string,
  date: LocalDate,
): Promise<EntryWithExercise[]> {
  const rows = await prisma.setEntry.findMany({
    where: { userId, localDate: date },
    include: entryInclude,
    orderBy: [{ performedAt: "asc" }, { createdAt: "asc" }],
  });
  return rows as unknown as EntryWithExercise[];
}

export async function getEntriesInRange(
  userId: string,
  start: LocalDate,
  end: LocalDate,
): Promise<EntryWithExercise[]> {
  const rows = await prisma.setEntry.findMany({
    where: { userId, localDate: { gte: start, lte: end } },
    include: entryInclude,
    orderBy: [{ performedAt: "asc" }],
  });
  return rows as unknown as EntryWithExercise[];
}

export async function getDaySummary(
  userId: string,
  date: LocalDate,
  timeZone: string,
  /**
   * The app's today, for anchoring the step baseline's 90-day window.
   *
   * Passed rather than defaulted to the container's local date, so the day
   * ring and the balance marker cannot end up on different baselines under a
   * Settings timezone override that crosses a date boundary — which is exactly
   * the disagreement `stepMetMinutes` below says it exists to prevent. (The
   * other half of that scan's cost, its lack of memoisation, is issue #23.)
   */
  today: LocalDate,
): Promise<DaySummary & {
  entries: EntryWithExercise[];
  steps: number | null;
  /** Minutes the phone called brisk, when it reports them. */
  activeMinutes: number | null;
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
  /** The weekly doses the day's rings are a seventh of. */
  targets: Targets;
}> {
  const [entries, walking, activeWindow, targetBouts, stepSettings, targets, physiology] =
    await Promise.all([
      getEntriesForDate(userId, date),
      getWalking(userId, date),
      getActiveWindow(userId),
      getTargetBouts(userId),
      getStepSettings(userId, today),
      getTargets(userId),
      getPhysiology(userId),
    ]);

  // Read against the day being viewed, so a heart rate is scored for the age
  // the user was, and so the day page and the stats page cannot disagree about
  // what a MET-minute was worth.
  const intensityContext = { physiology, today: date };

  const summary = summariseDay(date, entries);

  return {
    ...summary,
    entries,
    steps: walking.steps ?? null,
    activeMinutes: walking.activeMinutes ?? null,
    cardioMuscles: muscleCardioLoad(entries, (e) => entryMetMinutes(e, intensityContext)),
    metMinutes: Math.round(
      entries.reduce((sum, e) => sum + entryMetMinutes(e, intensityContext), 0),
    ),
    stepMetMinutes: Math.round(
      stepMetMinutes(
        walking.steps,
        stepSettings,
        impliedStepsFromEntries(entries),
        walking.activeMinutes,
      ),
    ),
    effectiveSets: round(totalEffectiveSets(summary.muscles)),
    hardSets: round(totalHardSets(entries)),
    spacing: daySpacing(entries.map(spacingEvent(timeZone)), activeWindow, targetBouts),
    targets,
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
export async function getActiveWindow(userId: string): Promise<ActiveWindow> {
  const settings = await getSettings(userId);
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
 * How many bouts a day the spacing score is measured against.
 *
 * Configurable for the reason the window is: five is the exercise-snacks dose
 * this app's format descends from, and someone chasing the far more frequent
 * sedentary-interruption dose should be able to say so and have the score, the
 * merge window and the nudge all move with them. See lib/spacing.ts.
 */
export async function getTargetBouts(userId: string): Promise<number> {
  const settings = await getSettings(userId);
  // An unset setting is `Number("") === 0`, which normaliseTargetBouts already
  // reads as "no answer" rather than as a target of none.
  return normaliseTargetBouts(Number(settings.targetBouts));
}

/**
 * What the app knows about whose heart rate it is reading.
 *
 * Both halves optional and both harmless when absent: without a birth year the
 * heart-rate factor falls back to the fixed anchor it always used, so entering
 * an age improves the estimate rather than restating anything already logged.
 */
export async function getPhysiology(userId: string): Promise<Physiology> {
  const settings = await getSettings(userId);

  const birthYear = Number(settings.birthYear);
  const restingHr = Number(settings.restingHr);

  return {
    birthYear:
      Number.isInteger(birthYear) && birthYear >= MIN_BIRTH_YEAR ? birthYear : null,
    restingHr:
      Number.isFinite(restingHr) && restingHr >= MIN_RESTING_HR && restingHr <= MAX_RESTING_HR
        ? restingHr
        : null,
  };
}

/**
 * The weekly doses each side is measured against.
 *
 * Configurable for the reason the step baseline and the active window are: the
 * defaults are the public-health guideline, and someone whose stated aim is the
 * mortality optimum should be able to say so and have every ring, marker and
 * exchange rate in the app move with them. See lib/targets.ts.
 */
export async function getTargets(userId: string): Promise<Targets> {
  const settings = await getSettings(userId);
  return normaliseTargets({
    cardioMetMinutesPerWeek: Number(settings.cardioTarget),
    strengthHardSetsPerWeek: Number(settings.strengthTarget),
  });
}

/**
 * Hard sets per muscle per week the user is aiming at.
 *
 * Configurable for the same reason the active window is: ~10 is where the
 * dose-response is clearly established, but someone deliberately running a
 * higher-volume block should be able to say so and have the radar agree with
 * them rather than draw a permanently full polygon.
 */
export async function getPerMuscleTarget(userId: string): Promise<number> {
  const settings = await getSettings(userId);
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
  userId: string,
  start: LocalDate,
  end: LocalDate,
  /** The user's today, which anchors the step baseline's 90-day window. */
  today: LocalDate,
): Promise<Record<LocalDate, DayLoad>> {
  const [entries, walkingByDate, stepSettings, targets, physiology] = await Promise.all([
    getEntriesInRange(userId, start, end),
    getWalkingInRange(userId, start, end),
    getStepSettings(userId, today),
    getTargets(userId),
    getPhysiology(userId),
  ]);

  // Anchored on the end of the range, so a month of shading is read on one
  // scale rather than shifting mid-grid on a birthday.
  const intensityContext = { physiology, today: end };

  const byDay: Record<string, DayLoad> = {};
  const entriesByDate = new Map<string, EntryWithExercise[]>();

  for (const entry of entries) {
    const list = entriesByDate.get(entry.localDate);
    if (list) list.push(entry);
    else entriesByDate.set(entry.localDate, [entry]);
  }

  const dates = new Set([...entriesByDate.keys(), ...Object.keys(walkingByDate)]);
  for (const date of dates) {
    const dayEntries = entriesByDate.get(date) ?? [];

    let effectiveSets = 0;
    let metMinutes = 0;
    for (const entry of dayEntries) {
      effectiveSets += entryEffectiveSets(entry);
      metMinutes += entryMetMinutes(entry, intensityContext);
    }

    const walking = walkingByDate[date];
    if (walking?.steps != null) {
      metMinutes += stepMetMinutes(
        walking.steps,
        stepSettings,
        impliedStepsFromEntries(dayEntries),
        walking.activeMinutes,
      );
    }

    // A day at the weekly guideline pace for both qualities scores the same as
    // a day of (target / 7) effective sets did before cardio existed.
    const cardio = effectiveSetEquivalents(metMinutes, targets);
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

export async function getSteps(userId: string, date: LocalDate): Promise<number | null> {
  const row = await prisma.dailyMetric.findUnique({
    where: { userId_localDate: { userId, localDate: date } },
  });
  return row?.steps ?? null;
}

/** A day's walking as the phone reported it — the count and the brisk minutes. */
export async function getWalking(userId: string, date: LocalDate): Promise<DayWalking> {
  const row = await prisma.dailyMetric.findUnique({
    where: { userId_localDate: { userId, localDate: date } },
  });
  return { steps: row?.steps ?? null, activeMinutes: row?.activeMinutes ?? null };
}

export async function getWalkingInRange(
  userId: string,
  start: LocalDate,
  end: LocalDate,
): Promise<Record<LocalDate, DayWalking>> {
  const rows = await prisma.dailyMetric.findMany({
    where: { userId, localDate: { gte: start, lte: end }, steps: { not: null } },
    select: { localDate: true, steps: true, activeMinutes: true },
  });
  return Object.fromEntries(
    rows.map((r) => [r.localDate, { steps: r.steps, activeMinutes: r.activeMinutes }]),
  );
}

export async function getStepsInRange(
  userId: string,
  start: LocalDate,
  end: LocalDate,
): Promise<Record<LocalDate, number>> {
  const rows = await prisma.dailyMetric.findMany({
    where: { userId, localDate: { gte: start, lte: end }, steps: { not: null } },
    select: { localDate: true, steps: true },
  });
  return Object.fromEntries(rows.map((r) => [r.localDate, r.steps as number]));
}

export async function setSteps(
  userId: string,
  date: LocalDate,
  steps: number | null,
  source = "manual",
  /**
   * Brisk minutes, where the caller knows about them.
   *
   * UNDEFINED AND NULL MEAN DIFFERENT THINGS, and the difference matters:
   * `null` is "clear it", which the day's own field sends when emptied;
   * `undefined` is "I am not the authority on this", which is what the voice
   * tab, the nightly Shortcut and the CSV import all are. Writing a default of
   * null for them would silently erase a value the phone had recorded every
   * time somebody dictated a step count.
   */
  activeMinutes?: number | null,
): Promise<void> {
  await prisma.dailyMetric.upsert({
    where: { userId_localDate: { userId, localDate: date } },
    create: { userId, localDate: date, steps, source, activeMinutes: activeMinutes ?? null },
    update: {
      steps,
      source,
      ...(activeMinutes === undefined ? {} : { activeMinutes }),
    },
  });
}

/**
 * How the user wants walking counted, and from what baseline.
 *
 * The baseline defaults to their own quiet quarter over the last 90 days rather
 * than to a fixed number, because a fixed number is wrong for both a desk
 * worker and a nurse. An explicit setting always wins.
 */
export async function getStepSettings(userId: string, today: LocalDate): Promise<StepSettings> {
  const settings = await getSettings(userId);
  const mode = (settings.stepsMode as StepsMode) ?? "half";

  const explicit = Number(settings.stepBaseline);
  if (Number.isFinite(explicit) && explicit > 0) {
    return { mode, baseline: explicit };
  }

  const history = await getStepsInRange(userId, addDays(today, -89), today);
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
  userId: string,
  start: LocalDate,
  end: LocalDate,
  today: LocalDate,
): Promise<ExerciseProgress[]> {
  const rows = await prisma.setEntry.findMany({
    where: {
      userId,
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
export async function getLastTrainedByAxis(userId: string): Promise<Map<AxisSlug, LocalDate>> {
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
    WHERE se.userId = ${userId} AND e.cardioBias < 1
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

/** The exercise fields the pickers, the planner and Settings all need. */
const exerciseSelect = {
  id: true,
  ownerId: true,
  name: true,
  slug: true,
  category: true,
  bodyweight: true,
  cardioBias: true,
  mets: true,
  isCustom: true,
  equipment: true,
  load: true,
  impact: true,
  floor: true,
  sweat: true,
  snackReps: true,
  snackSeconds: true,
  unilateral: true,
  cues: true,
  muscles: { select: { muscle: true, weight: true } },
} as const;

/**
 * The movements one user can log: the shared catalogue plus their own.
 *
 * A movement of their own SHADOWS a catalogue one with the same slug. That only
 * happens when somebody added "Wall sit" by hand before the catalogue grew one,
 * and their own copy — carrying their history and their muscle mapping — is
 * the one they mean.
 */
export async function getExercises(userId: string) {
  const rows = await prisma.exercise.findMany({
    where: { archived: false, OR: [{ ownerId: null }, { ownerId: userId }] },
    select: exerciseSelect,
    orderBy: { name: "asc" },
  });
  const own = new Set(rows.filter((r) => r.ownerId === userId).map((r) => r.slug));
  return rows
    .filter((r) => r.ownerId !== null || !own.has(r.slug))
    .map(({ ownerId, ...row }) => ({ ...row, mine: ownerId === userId }));
}

/**
 * One exercise, if this user can see it. The same visibility rule as
 * `getExercises`, for resolving an id a request names.
 */
export async function findVisibleExercise(userId: string, id: string) {
  return prisma.exercise.findFirst({
    where: { id, OR: [{ ownerId: null }, { ownerId: userId }] },
    select: { ...exerciseSelect, archived: true },
  });
}

/**
 * One exercise by slug, preferring the user's own over the catalogue's — the
 * lookup behind logging "Pull-up" by name.
 */
export async function findVisibleExerciseBySlug(userId: string, slug: string) {
  const rows = await prisma.exercise.findMany({
    where: { slug, OR: [{ ownerId: null }, { ownerId: userId }] },
    select: { id: true, ownerId: true, name: true, archived: true },
  });
  return rows.find((r) => r.ownerId === userId) ?? rows.find((r) => r.ownerId === null) ?? null;
}

/**
 * The most recent day any cardio was logged. Cardio has no radar axis — the
 * radar is muscle coverage — but "you have not done cardio in nine days" is
 * exactly the question this app exists to answer, so it earns a row in the
 * "needs attention" list.
 */
export async function getLastCardioDate(userId: string): Promise<LocalDate | null> {
  const rows = await prisma.$queryRaw<{ lastDate: string | null }[]>`
    SELECT MAX(se.localDate) AS lastDate
    FROM SetEntry se
    JOIN Exercise e ON e.id = se.exerciseId
    WHERE se.userId = ${userId} AND e.cardioBias > 0
  `;
  return rows[0]?.lastDate ?? null;
}

export type ExerciseSummary = Awaited<ReturnType<typeof getExercises>>[number];

/**
 * How recently each exercise was used, so the picker can float what you
 * actually do to the top instead of making you scroll an alphabetical list.
 */
export async function getRecentExerciseIds(userId: string, limit = 12): Promise<string[]> {
  const rows = await prisma.setEntry.groupBy({
    by: ["exerciseId"],
    where: { userId },
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
export const getSettings = cache(async (userId: string): Promise<Record<string, string>> => {
  const rows = await prisma.setting.findMany({ where: { userId } });
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
});

export async function getSetting(userId: string, key: string): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { userId_key: { userId, key } } });
  return row?.value ?? null;
}

/**
 * Write one of a user's settings. An empty string deletes it, which is how the
 * UI says "back to the default".
 */
export async function putSetting(userId: string, key: string, value: string): Promise<void> {
  if (value === "") {
    await prisma.setting.deleteMany({ where: { userId, key } });
    return;
  }
  await prisma.setting.upsert({
    where: { userId_key: { userId, key } },
    create: { userId, key, value },
    update: { value },
  });
}

/** Earliest logged day, used to bound "days since" answers sensibly. */
export async function getFirstLoggedDate(userId: string): Promise<LocalDate | null> {
  const row = await prisma.setEntry.findFirst({
    where: { userId },
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
  userId: string,
  windowDays: number,
  today: LocalDate,
  timeZone: string,
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
    walking,
    stepSettings,
    activeWindow,
    targetBouts,
    perMuscleTarget,
    progress,
    targets,
    physiology,
  ] = await Promise.all([
    getEntriesInRange(userId, current.start, current.end),
    comparePrevious ? getEntriesInRange(userId, previous.start, previous.end) : [],
    getLastTrainedByAxis(userId),
    getLastCardioDate(userId),
    getWalkingInRange(userId, current.start, current.end),
    getStepSettings(userId, today),
    getActiveWindow(userId),
    getTargetBouts(userId),
    getPerMuscleTarget(userId),
    // A stall is a slow signal: a movement cannot be shown as flat for nine
    // weeks by a seven-day window. So progression always looks back far enough
    // to see one, whatever window the user is reading the rest of the page on.
    getExerciseProgress(userId, addDays(today, -(PROGRESS_WINDOW_DAYS - 1)), today, today),
    getTargets(userId),
    getPhysiology(userId),
  ]);

  // One context for the whole window, so every MET figure on the page is read
  // on the same scale — the user's own, once they have entered an age.
  const intensityContext = { physiology, today };

  const balance = buildBalance({
    windowDays,
    entries: currentEntries,
    walkingByDate: walking,
    stepSettings,
    targets,
    intensityContext,
  });

  const eventsByDate = new Map<string, BoutEvent[]>();
  const toEvent = spacingEvent(timeZone);
  for (const entry of currentEntries) {
    const events = eventsByDate.get(entry.localDate);
    if (events) events.push(toEvent(entry));
    else eventsByDate.set(entry.localDate, [toEvent(entry)]);
  }

  const spacing = summariseSpacing(
    [...eventsByDate].map(
      ([date, events]) => [date, daySpacing(events, activeWindow, targetBouts)] as const,
    ),
    activeWindow,
    targetBouts,
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
    daysWithSteps: Object.keys(walking).length,
    spacing,
    perMuscleTarget,
    progress,
    // The radar's second series: MET-minutes carried onto the effective-set
    // scale by the balance module's guideline exchange rate. Converted here,
    // once, so the chart never has to know either currency.
    cardioLoadFor: (entry) =>
      effectiveSetEquivalents(entryMetMinutes(entry, intensityContext), targets),
    targets,
    intensity: summariseIntensity({
      entries: currentEntries,
      windowDays,
      physiology,
      today,
      classify: (entry) =>
        classifyIntensity(
          {
            mets: metsForEntry(entry, intensityContext),
            avgHeartRate: entry.avgHeartRate,
          },
          physiology,
          today,
        ),
      metMinutesFor: (entry) => entryMetMinutes(entry, intensityContext),
      minutesFor: entryMinutes,
      dateOf: (entry) => entry.localDate,
      daysBetween,
    }),
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
