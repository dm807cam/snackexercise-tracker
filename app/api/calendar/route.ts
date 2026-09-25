import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { getAppConfig } from "@/lib/app-config";
import { getDailyLoad } from "@/lib/queries";
import { localDateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD — per-day strength and cardio load. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    const params = request.nextUrl.searchParams;
    const { start, end } = z
      .object({ start: localDateSchema, end: localDateSchema })
      .refine((range) => range.start <= range.end, { message: "start must not be after end" })
      .parse({ start: params.get("start"), end: params.get("end") });

    const { today } = await getAppConfig(user.id);
    return { load: await getDailyLoad(user.id, start, end, today) };
  });
}
