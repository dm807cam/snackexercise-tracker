import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { getStepSettings, getStepsInRange, setSteps } from "@/lib/queries";
import { dailyMetricSchema, localDateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/metrics?start=YYYY-MM-DD&end=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const params = request.nextUrl.searchParams;
    const { start, end } = z
      .object({ start: localDateSchema, end: localDateSchema })
      .parse({ start: params.get("start"), end: params.get("end") });

    const [steps, settings] = await Promise.all([
      getStepsInRange(start, end),
      getStepSettings(),
    ]);
    return { steps, settings };
  });
}

const bulkSchema = z.object({
  days: z
    .array(dailyMetricSchema.extend({ localDate: localDateSchema }))
    .min(1)
    .max(2000),
});

/**
 * POST /api/metrics — backfill many days at once, which is how anyone with an
 * existing Health or Fitbit export will actually get their history in. Upserts
 * per day, so re-importing the same export corrects rather than duplicates.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { days } = bulkSchema.parse(await request.json());

    for (const day of days) {
      await setSteps(day.localDate, day.steps ?? null, day.source);
    }
    return { written: days.length };
  });
}
