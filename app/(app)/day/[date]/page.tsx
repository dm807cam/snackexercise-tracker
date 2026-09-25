import { notFound } from "next/navigation";
import { DayView, type SnackCardData } from "@/components/DayView";
import { isValidLocalDate, minutesOfDayInZone } from "@/lib/dates";
import {
  getActiveWindow,
  getDaySummary,
  getExercises,
  getRecentExerciseIds,
  getSetting,
  getTargetBouts,
} from "@/lib/queries";
import { getAppConfig } from "@/lib/app-config";
import { requireUser } from "@/lib/auth/current";
import { spacingNudge } from "@/lib/suggest";
import { getContexts, previewSnack, snacksOn } from "@/lib/snack/service";
import { todaySchedule } from "@/lib/snack/schedule-service";
import { MAX_SNACK_MINUTES, MIN_SNACK_MINUTES } from "@/lib/snack/planner";

export const dynamic = "force-dynamic";

/** The length the card opens on, until the user picks another (remembered). */
const DEFAULT_SNACK_MINUTES = 3;

export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const user = await requireUser();
  const { date } = await params;
  if (!isValidLocalDate(date)) notFound();

  const config = await getAppConfig(user.id);

  const [summary, exercises, recentIds] = await Promise.all([
    getDaySummary(user.id, date, config.timeZone, config.today),
    getExercises(user.id),
    getRecentExerciseIds(user.id),
  ]);

  // "What should I do next" is a statement about now. On a past day it would be
  // advice about a Tuesday in August, which is nobody's question.
  let snack: SnackCardData | null = null;
  if (date === config.today) {
    const stored = Number(await getSetting(user.id, "snackMinutes"));
    const minutes =
      Number.isInteger(stored) && stored >= MIN_SNACK_MINUTES && stored <= MAX_SNACK_MINUTES
        ? stored
        : DEFAULT_SNACK_MINUTES;

    const [{ contexts, activeId }, preview, snacks, activeWindow, targetBouts, schedule] = await Promise.all([
      getContexts(user.id),
      previewSnack(user.id, { minutes, focus: "auto", nonce: 0 }),
      snacksOn(user.id, config.today),
      getActiveWindow(user.id),
      getTargetBouts(user.id),
      todaySchedule(user.id),
    ]);

    snack = {
      plan: preview.plan,
      places: contexts.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
      activePlaceId: activeId,
      defaultMinutes: minutes,
      nudge: spacingNudge({
        nowMin: minutesOfDayInZone(new Date(), config.timeZone),
        boutMinutes: summary.spacing.boutMinutes,
        window: activeWindow,
        targetBouts,
      }),
      resumable: snacks.find((s) => s.status === "started") ?? null,
      upcoming: {
        times: schedule.slots.map((slot) => slot.time),
        done: schedule.done,
        target: schedule.targetBouts,
        dueNow: schedule.dueNow,
        nudgesOn: schedule.nudges.activeToday,
        nudgesEnabled: schedule.nudges.enabled,
        pausedUntil: schedule.nudges.pausedUntil,
      },
    };
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
        activeMinutes: summary.activeMinutes,
        cardioMuscles: summary.cardioMuscles,
        metMinutes: summary.metMinutes,
        stepMetMinutes: summary.stepMetMinutes,
        effectiveSets: summary.effectiveSets,
        hardSets: summary.hardSets,
        targets: summary.targets,
        spacing: summary.spacing,
      }}
      exercises={exercises}
      recentIds={recentIds}
      units={config.units}
      timeZone={config.timeZone}
      today={config.today}
      hasKey={config.hasKey}
      snack={snack ? JSON.parse(JSON.stringify(snack)) : null}
    />
  );
}
