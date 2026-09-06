/**
 * Database reads shared by pages and API routes. Kept separate from the pure
 * scoring maths in lib/scoring.ts so that file stays trivially testable.
 */

import { prisma } from "./db";
import { type LocalDate, addDays, daysBetween, todayLocalDate } from "./dates";
import type { AxisSlug } from "./muscles";
import { axisForMuscle } from "./muscles";
import { type ScoredEntry, summariseDay, type DaySummary } from "./scoring";

/** The exercise fields every scoring path needs. */
const entryInclude = {
  exercise: {
    select: {
      id: true,
      name: true,
      bodyweight: true,
      muscles: { select: { muscle: true, weight: true } },
    },
  },
} as const;

export type EntryWithExercise = ScoredEntry & {
  notes: string | null;
  source: string;
  exercise: ScoredEntry["exercise"] & { bodyweight: boolean };
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

export async function getDaySummary(date: LocalDate): Promise<DaySummary & {
  entries: EntryWithExercise[];
}> {
  const entries = await getEntriesForDate(date);
  return { ...summariseDay(date, entries), entries };
}

/**
 * Total effective sets per day across a range — powers the calendar's intensity
 * dots. Returns only days that actually have entries.
 */
export async function getDailyLoad(
  start: LocalDate,
  end: LocalDate,
): Promise<Record<LocalDate, number>> {
  const entries = await getEntriesInRange(start, end);
  const byDay: Record<string, number> = {};
  for (const entry of entries) {
    const sets = entry.sets > 0 ? entry.sets : 1;
    const contribution = entry.exercise.muscles.reduce((sum, m) => sum + sets * m.weight, 0);
    byDay[entry.localDate] = (byDay[entry.localDate] ?? 0) + contribution;
  }
  return byDay;
}

/**
 * Most recent date each radar axis was trained, looking back over the whole
 * log. This drives the "days since last trained" table, which for unstructured
 * training is the single most actionable number in the app.
 */
export async function getLastTrainedByAxis(): Promise<Map<AxisSlug, LocalDate>> {
  // One grouped query rather than one per axis: get the latest localDate for
  // every muscle, then roll those up.
  const rows = await prisma.$queryRaw<{ muscle: string; lastDate: string }[]>`
    SELECT em.muscle AS muscle, MAX(se.localDate) AS lastDate
    FROM SetEntry se
    JOIN ExerciseMuscle em ON em.exerciseId = se.exerciseId
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
      isCustom: true,
      muscles: { select: { muscle: true, weight: true } },
    },
    orderBy: { name: "asc" },
  });
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

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

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

export { addDays, daysBetween, todayLocalDate };
