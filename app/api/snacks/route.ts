import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { getAppConfig } from "@/lib/app-config";
import { localDateSchema } from "@/lib/validation";
import { createSnack, snackRequestSchema, snacksOn } from "@/lib/snack/service";
import { count } from "@/lib/metrics";

export const dynamic = "force-dynamic";

/** GET /api/snacks?date=YYYY-MM-DD — a day's snacks (default today). */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    const { today } = await getAppConfig(user.id);
    const date = localDateSchema.parse(request.nextUrl.searchParams.get("date") ?? today);
    return { snacks: await snacksOn(user.id, date) };
  });
}

/**
 * POST /api/snacks — plan a snack for right now: `{ minutes, focus?, contextId?, nonce? }`.
 * The plan is kept, so the player can pick it up again after a reload.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const body = await request.json().catch(() => ({}));
    const snack = await createSnack(user.id, snackRequestSchema.parse(body ?? {}));
    count("snack_snacks_planned_total", { trigger: "app" });
    return { snack };
  });
}
