import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { getEntriesInRange, getLastTrainedByAxis } from "@/lib/queries";
import { previousWindowRange, todayLocalDate, windowRange } from "@/lib/dates";
import { buildStats } from "@/lib/scoring";
import { statsWindowSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/stats?window=7|30|60|90|180 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const windowDays = statsWindowSchema.parse(request.nextUrl.searchParams.get("window") ?? 30);
    const today = todayLocalDate();

    const current = windowRange(windowDays, today);
    const previous = previousWindowRange(windowDays, today);

    const [currentEntries, previousEntries, lastTrained] = await Promise.all([
      getEntriesInRange(current.start, current.end),
      getEntriesInRange(previous.start, previous.end),
      getLastTrainedByAxis(),
    ]);

    return buildStats({
      windowDays,
      start: current.start,
      end: current.end,
      current: currentEntries,
      previous: previousEntries,
      lastTrained,
      today,
    });
  });
}
