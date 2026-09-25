import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { putSetting } from "@/lib/queries";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Hours from now, or null to resume. Up to a fortnight: a holiday, a sick week. */
  hours: z.number().min(0.25).max(24 * 14).nullable(),
});

/** POST /api/nudges/pause — quiet for a while: a meeting block, a flight, a holiday. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const { hours } = bodySchema.parse(await request.json());
    if (hours == null) {
      await putSetting(user.id, "nudgesPausedUntil", "");
      return { pausedUntil: null };
    }
    const until = new Date(Date.now() + hours * 3_600_000);
    await putSetting(user.id, "nudgesPausedUntil", until.toISOString());
    return { pausedUntil: until };
  });
}
