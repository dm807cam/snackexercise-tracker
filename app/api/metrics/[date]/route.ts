import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { getWalking, setSteps } from "@/lib/queries";
import { dailyMetricSchema, localDateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ date: string }> };

/** GET /api/metrics/YYYY-MM-DD */
export async function GET(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    const localDate = localDateSchema.parse((await params).date);
    return { localDate, ...(await getWalking(user.id, localDate)) };
  });
}

/**
 * PUT /api/metrics/YYYY-MM-DD — set (or clear) a day's measurements.
 *
 * Idempotent by design: this is the endpoint a phone automation hits every
 * night, with a token carrying the `metrics:write` scope, and re-running
 * yesterday's shortcut must correct the number rather than add to it.
 * `steps: null` clears the day.
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "metrics:write" });
    const localDate = localDateSchema.parse((await params).date);
    const input = dailyMetricSchema.parse(await request.json());

    // `activeMinutes` is forwarded as-is: absent from the body means "leave it
    // alone", which is what the nightly Shortcut and the voice tab are saying.
    await setSteps(user.id, localDate, input.steps ?? null, input.source, input.activeMinutes);
    return {
      localDate,
      steps: input.steps ?? null,
      activeMinutes: input.activeMinutes ?? null,
    };
  });
}
