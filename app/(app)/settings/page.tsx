import { SettingsView } from "@/components/Settings";
import { getAppConfig } from "@/lib/app-config";
import { requireUser } from "@/lib/auth/current";
import {
  getActiveWindow,
  getExercises,
  getPerMuscleTarget,
  getPhysiology,
  getSettings,
  getStepSettings,
  getTargetBouts,
  getTargets,
} from "@/lib/queries";
import { DEFAULT_MODEL } from "@/lib/openrouter";
import { stepsForMetMinutes } from "@/lib/cardio";
import { MAX_STEP_SHARE_OF_CARDIO_RING } from "@/lib/daily-goal";
import { getContexts } from "@/lib/snack/service";
import { todaySchedule } from "@/lib/snack/schedule-service";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [config, settings, exercises, places, schedule] = await Promise.all([
    getAppConfig(user.id),
    getSettings(user.id),
    getExercises(user.id),
    getContexts(user.id),
    todaySchedule(user.id),
  ]);
  const [stepSettings, activeWindow, targetBouts, perMuscleTarget, targets, physiology] =
    await Promise.all([
      getStepSettings(user.id, config.today),
      getActiveWindow(user.id),
      getTargetBouts(user.id),
      getPerMuscleTarget(user.id),
      getTargets(user.id),
      getPhysiology(user.id),
    ]);

  return (
    <SettingsView
      initial={{
        units: config.units,
        timezone: config.timeZone,
        model: settings.openrouterModel ?? DEFAULT_MODEL,
        hasKey: config.hasKey,
        stepsMode: stepSettings.mode,
        stepBaseline: settings.stepBaseline ?? "",
        resolvedBaseline: stepSettings.baseline,
        stepsForHalfRing: stepsForMetMinutes(
          (targets.cardioMetMinutesPerWeek / 7) * MAX_STEP_SHARE_OF_CARDIO_RING,
          stepSettings,
        ),
        dayStartHour: activeWindow.startHour,
        dayEndHour: activeWindow.endHour,
        targetBouts,
        perMuscleTarget,
        targets,
        physiology,
      }}
      exercises={exercises}
      user={{ email: user.email, name: user.name, role: user.role }}
      places={{
        contexts: places.contexts.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          equipment: c.equipment,
          quiet: c.quiet,
          floor: c.floor,
          sweat: c.sweat,
        })),
        activeId: places.activeId,
      }}
      schedule={schedule}
    />
  );
}
