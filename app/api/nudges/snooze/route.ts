import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { putSetting } from "@/lib/queries";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ minutes: z.number().int().min(5).max(180).default(30) });

/** POST /api/nudges/snooze — "in 30 minutes", from the notification itself. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const { minutes } = bodySchema.parse(await request.json().catch(() => ({})));
    const until = new Date(Date.now() + minutes * 60_000);
    await putSetting(user.id, "nudgeSnoozedUntil", until.toISOString());
    return { snoozedUntil: until };
  });
}
