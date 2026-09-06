import { SettingsView } from "@/components/Settings";
import { getAppConfig } from "@/lib/app-config";
import { getExercises, getSettings } from "@/lib/queries";
import { DEFAULT_MODEL } from "@/lib/openrouter";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [config, settings, exercises] = await Promise.all([
    getAppConfig(),
    getSettings(),
    getExercises(),
  ]);

  return (
    <SettingsView
      initial={{
        units: config.units,
        timezone: config.timeZone,
        model: settings.openrouterModel ?? DEFAULT_MODEL,
        hasKey: config.hasKey,
      }}
      exercises={exercises}
    />
  );
}
