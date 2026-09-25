import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { loadStats } from "@/lib/queries";
import { getAppConfig } from "@/lib/app-config";
import { statsWindowSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/stats?window=7|30|60|90|180 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    const windowDays = statsWindowSchema.parse(request.nextUrl.searchParams.get("window") ?? 30);
    const { today, timeZone } = await getAppConfig(user.id);
    return loadStats(user.id, windowDays, today, timeZone);
  });
}
