import { getSettings } from "./queries";
import { toLocalDateInZone, type LocalDate } from "./dates";
import type { Units } from "./format";
import { config } from "./config";
import { sharedOpenRouterKey } from "./instance";

export interface AppConfig {
  /** IANA zone that defines this user's day boundaries and clock times. */
  timeZone: string;
  /** Today in that zone, resolved on the server so the client cannot disagree. */
  today: LocalDate;
  units: Units;
  /** Whether voice entry has a key to use: the user's own, or a shared one. */
  hasKey: boolean;
}

/** Whether a string names a zone this runtime can actually convert into. */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve one user's timezone once per request.
 *
 * Every account has its own: two people on one instance can be in different
 * cities, and a traveller's day follows them when they change it in Settings.
 * The container's TZ is only the default for someone who has not said.
 */
export async function getAppConfig(userId: string): Promise<AppConfig> {
  const settings = await getSettings(userId);
  const stored = settings.timezone;
  const timeZone = stored && isValidTimeZone(stored) ? stored : config.defaultTimeZone;

  return {
    timeZone,
    today: toLocalDateInZone(new Date(), timeZone),
    units: settings.units === "lb" ? "lb" : "kg",
    hasKey: Boolean(settings.openrouterKey) || Boolean(await sharedOpenRouterKey()),
  };
}

/** The OpenRouter key voice entry should use for this user, or null. */
export async function openRouterKeyFor(userId: string): Promise<string | null> {
  const settings = await getSettings(userId);
  return settings.openrouterKey || (await sharedOpenRouterKey());
}
