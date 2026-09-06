import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { getDailyLoad } from "@/lib/queries";
import { localDateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** GET /api/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD — per-day effective sets. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const params = request.nextUrl.searchParams;
    const { start, end } = z
      .object({ start: localDateSchema, end: localDateSchema })
      .parse({ start: params.get("start"), end: params.get("end") });

    return { load: await getDailyLoad(start, end) };
  });
}
