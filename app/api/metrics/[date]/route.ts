import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { getWalking, setSteps } from "@/lib/queries";
import { dailyMetricSchema, localDateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ date: string }> };

/** GET /api/metrics/YYYY-MM-DD */
export async function GET(_request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { date } = await params;
    const localDate = localDateSchema.parse(date);
    return { localDate, ...(await getWalking(localDate)) };
  });
}

/**
 * PUT /api/metrics/YYYY-MM-DD — set (or clear) a day's measurements.
 *
 * Idempotent by design: this is the endpoint a phone automation hits every
 * night, and re-running yesterday's shortcut must correct the number rather
 * than add to it. `steps: null` clears the day.
 */
export async function PUT(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { date } = await params;
    const localDate = localDateSchema.parse(date);
    const input = dailyMetricSchema.parse(await request.json());

    await setSteps(localDate, input.steps ?? null, input.source, input.activeMinutes ?? null);
    return {
      localDate,
      steps: input.steps ?? null,
      activeMinutes: input.activeMinutes ?? null,
    };
  });
}
