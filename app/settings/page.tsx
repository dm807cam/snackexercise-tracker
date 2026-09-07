import { SettingsView } from "@/components/Settings";
import { getAppConfig } from "@/lib/app-config";
import { getActiveWindow, getExercises, getSettings, getStepSettings } from "@/lib/queries";
import { DEFAULT_MODEL } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [config, settings, exercises] = await Promise.all([
    getAppConfig(),
    getSettings(),
    getExercises(),
  ]);
  const [stepSettings, activeWindow] = await Promise.all([
    getStepSettings(config.today),
    getActiveWindow(),
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
      }}
      exercises={exercises}
    />
  );
}
