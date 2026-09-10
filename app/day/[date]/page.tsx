import { notFound } from "next/navigation";
import { DayView } from "@/components/DayView";
import { isValidLocalDate, minutesOfDayInZone } from "@/lib/dates";
import {
  getActiveWindow,
  getDaySummary,
  getExercises,
  getRecentExerciseIds,
  loadStats,
} from "@/lib/queries";
import { getAppConfig } from "@/lib/app-config";
import { axisForMuscle } from "@/lib/muscles";
import { buildSuggestion, type Suggestion } from "@/lib/suggest";

export const dynamic = "force-dynamic";

/**
 * The window the suggestion reasons over. Long enough that a single heavy
 * Tuesday cannot make an axis look permanently covered, short enough that
 * something you dropped a fortnight ago resurfaces.
 */
const SUGGESTION_WINDOW = 30;

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidLocalDate(date)) notFound();

  const config = await getAppConfig();

  const [summary, exercises, recentIds] = await Promise.all([
    getDaySummary(date, config.timeZone),
    getExercises(),
    getRecentExerciseIds(),
  ]);

  // "What should I do next" is a statement about now. On a past day it would be
  // advice about a Tuesday in August, which is nobody's question.
  let suggestion: Suggestion | null = null;
  if (date === config.today) {
    const [stats, activeWindow] = await Promise.all([
      // No previous-window comparison: the suggestion never reads it, and this
      // runs again after every logged, edited or deleted set.
      loadStats(SUGGESTION_WINDOW, config.today, config.timeZone, false),
      getActiveWindow(),
    ]);

    suggestion = buildSuggestion({
      axes: stats.axes,
      daysSinceCardio: stats.daysSinceCardio,
      cardioMetMinutesPerWeek: stats.balance.detail.metMinutesPerWeek,
      exercises,
      recentIds,
      axisOf: axisForMuscle,
      now: {
        nowMin: minutesOfDayInZone(new Date(), config.timeZone),
        boutMinutes: summary.spacing.boutMinutes,
        window: activeWindow,
      },
    });
  }

  return (
    <DayView
      // Remounting on date change resets the view's internal state cleanly
      // rather than relying on effects to unpick the previous day.
      key={date}
      initial={{
        date,
        entries: JSON.parse(JSON.stringify(summary.entries)),
        muscles: summary.muscles,
        sets: summary.sets,
        reps: summary.reps,
        tonnageKg: summary.tonnageKg,
        steps: summary.steps,
        cardioMuscles: summary.cardioMuscles,
        metMinutes: summary.metMinutes,
        stepMetMinutes: summary.stepMetMinutes,
        effectiveSets: summary.effectiveSets,
        spacing: summary.spacing,
      }}
      exercises={exercises}
      recentIds={recentIds}
      units={config.units}
      timeZone={config.timeZone}
      today={config.today}
      hasKey={config.hasKey}
      suggestion={suggestion}
    />
  );
}
