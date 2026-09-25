import { NextRequest } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { isValidTimeZone } from "@/lib/app-config";
import { sharedOpenRouterKey } from "@/lib/instance";
import { getSettings, putSetting } from "@/lib/queries";
import { settingsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Keys whose values must never be sent to the browser. */
const SECRET_KEYS = new Set(["openrouterKey"]);

export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    const all = await getSettings(user.id);
    const safe: Record<string, string> = {};
    for (const [key, value] of Object.entries(all)) {
      if (SECRET_KEYS.has(key)) continue;
      safe[key] = value;
    }
    // Report only whether a key is configured, never the key itself.
    return {
      settings: safe,
      hasOpenrouterKey: Boolean(all.openrouterKey),
      hasSharedOpenrouterKey: Boolean(await sharedOpenRouterKey()),
    };
  });
}

export async function PUT(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const input = settingsSchema.parse(await request.json());

    if (input.timezone && !isValidTimeZone(input.timezone)) {
      throw new ApiError(`"${input.timezone}" is not a timezone this server knows — try a name like Europe/Berlin`, 400);
    }

    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      // An empty string is how the UI clears a value (e.g. removing the key).
      await putSetting(user.id, key, value);
    }
    return { ok: true };
  });
}
