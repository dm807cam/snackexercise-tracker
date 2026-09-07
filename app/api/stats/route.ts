import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { loadStats } from "@/lib/queries";
import { getAppConfig } from "@/lib/app-config";
import { statsWindowSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/stats?window=7|30|60|90|180 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const windowDays = statsWindowSchema.parse(request.nextUrl.searchParams.get("window") ?? 30);
    const { today, timeZone } = await getAppConfig();
    return loadStats(windowDays, today, timeZone);
  });
}
