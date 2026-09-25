import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { audit } from "@/lib/audit";
import { authenticate } from "@/lib/auth/guard";
import { getInstanceSetting, registrationMode, setInstanceSetting } from "@/lib/instance";

export const dynamic = "force-dynamic";

/** GET /api/admin/settings — how this instance is run. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await authenticate(request, { sessionOnly: true, admin: true });
    return {
      registration: await registrationMode(),
      // Whether a shared key is set, never the key itself.
      hasSharedOpenRouterKey: Boolean(await getInstanceSetting("openrouterKey")),
      hasEnvOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    };
  });
}

const putSchema = z.object({
  registration: z.enum(["closed", "invite", "open"]).optional(),
  /** Empty string clears it. */
  sharedOpenRouterKey: z.string().max(200).optional(),
});

/** PUT /api/admin/settings */
export async function PUT(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true, admin: true });
    const input = putSchema.parse(await request.json());

    if (input.registration) await setInstanceSetting("registration", input.registration);
    if (input.sharedOpenRouterKey !== undefined) {
      await setInstanceSetting("openrouterKey", input.sharedOpenRouterKey.trim() || null);
    }

    await audit("admin.settings_updated", {
      actorId: user.id,
      request,
      detail: {
        ...(input.registration ? { registration: input.registration } : {}),
        ...(input.sharedOpenRouterKey !== undefined
          ? { sharedOpenRouterKey: input.sharedOpenRouterKey.trim() ? "set" : "cleared" }
          : {}),
      },
    });
    return { ok: true };
  });
}
