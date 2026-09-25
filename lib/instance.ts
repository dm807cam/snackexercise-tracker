/**
 * Settings that belong to the installation rather than to anyone in it:
 * whether strangers may sign up, a shared OpenRouter key, the Web Push keys.
 */

import { prisma } from "./db";
import { config, registrationFromEnv, type RegistrationMode } from "./config";

export async function getInstanceSetting(key: string): Promise<string | null> {
  const row = await prisma.instanceSetting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setInstanceSetting(key: string, value: string | null): Promise<void> {
  if (value == null || value === "") {
    await prisma.instanceSetting.deleteMany({ where: { key } });
    return;
  }
  await prisma.instanceSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/**
 * Who may create an account.
 *
 *   closed — nobody; an admin creates accounts by invitation only, and the
 *            sign-up page says so.
 *   invite — anyone holding an invitation link (the default).
 *   open   — anyone who can reach the app. Only sensible on a private network.
 *
 * The REGISTRATION variable is the default; an admin's choice in the console
 * overrides it, so it can change without a redeploy.
 */
export async function registrationMode(): Promise<RegistrationMode> {
  return registrationFromEnv((await getInstanceSetting("registration")) ?? undefined) ?? config.registration;
}

/**
 * The OpenRouter key voice entry falls back to when a user has none of their
 * own: one an admin chose to share, else the OPENROUTER_API_KEY the container
 * was started with. Spending shared credit is a decision somebody made on
 * purpose, never a side effect of one user pasting their key.
 */
export async function sharedOpenRouterKey(): Promise<string | null> {
  return (await getInstanceSetting("openrouterKey")) ?? (process.env.OPENROUTER_API_KEY?.trim() || null);
}
