import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/queries";
import { settingsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Keys whose values must never be sent to the browser. */
const SECRET_KEYS = new Set(["openrouterKey"]);

export async function GET() {
  return handle(async () => {
    const all = await getSettings();
    const safe: Record<string, string> = {};
    for (const [key, value] of Object.entries(all)) {
      if (SECRET_KEYS.has(key)) continue;
      safe[key] = value;
    }
    // Report only whether a key is configured, never the key itself.
    return { settings: safe, hasOpenrouterKey: Boolean(all.openrouterKey) };
  });
}

export async function PUT(request: NextRequest) {
  return handle(async () => {
    const input = settingsSchema.parse(await request.json());

    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      // An empty string is how the UI clears a value (e.g. removing the key).
      if (value === "") {
        await prisma.setting.deleteMany({ where: { key } });
        continue;
      }
      await prisma.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    }
    return { ok: true };
  });
}
