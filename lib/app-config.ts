import { getSettings } from "./queries";
import { toLocalDateInZone, type LocalDate } from "./dates";
import type { Units } from "./format";

export interface AppConfig {
  /** IANA zone that defines day boundaries and clock times across the app. */
  timeZone: string;
  /** Today in that zone, resolved on the server so the client cannot disagree. */
  today: LocalDate;
  units: Units;
  hasKey: boolean;
}

/**
 * Resolve the app's timezone once per request. The container's TZ is the
 * default; a Settings override lets the app follow you without a redeploy.
 */
export async function getAppConfig(): Promise<AppConfig> {
  const settings = await getSettings();
  const timeZone =
    settings.timezone ||
    process.env.TZ ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "UTC";

  return {
    timeZone,
    today: toLocalDateInZone(new Date(), timeZone),
    units: (settings.units as Units) ?? "kg",
    hasKey: Boolean(settings.openrouterKey),
  };
}
