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

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [config, settings, exercises] = await Promise.all([
    getAppConfig(user.id),
    getSettings(user.id),
    getExercises(user.id),
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
    />
  );
}
