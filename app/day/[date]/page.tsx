import { notFound } from "next/navigation";
import { DayView } from "@/components/DayView";
import { isValidLocalDate } from "@/lib/dates";
import { getDaySummary, getExercises, getRecentExerciseIds } from "@/lib/queries";
import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  if (!isValidLocalDate(date)) notFound();

  const [summary, exercises, recentIds, config] = await Promise.all([
    getDaySummary(date),
    getExercises(),
    getRecentExerciseIds(),
    getAppConfig(),
  ]);

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
      }}
      exercises={exercises}
      recentIds={recentIds}
      units={config.units}
      timeZone={config.timeZone}
      today={config.today}
      hasKey={config.hasKey}
    />
  );
}
