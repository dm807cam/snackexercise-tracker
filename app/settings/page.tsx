import { SettingsView } from "@/components/Settings";
import { getAppConfig } from "@/lib/app-config";
import {
  getActiveWindow,
  getExercises,
  getPerMuscleTarget,
  getPhysiology,
  getSettings,
  getStepSettings,
  getTargets,
} from "@/lib/queries";
import { DEFAULT_MODEL } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [config, settings, exercises] = await Promise.all([
    getAppConfig(),
    getSettings(),
    getExercises(),
  ]);
  const [stepSettings, activeWindow, perMuscleTarget, targets, physiology] = await Promise.all([
    getStepSettings(config.today),
    getActiveWindow(),
    getPerMuscleTarget(),
    getTargets(),
    getPhysiology(),
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
        dayStartHour: activeWindow.startHour,
        dayEndHour: activeWindow.endHour,
        perMuscleTarget,
        targets,
        physiology,
      }}
      exercises={exercises}
    />
  );
}
