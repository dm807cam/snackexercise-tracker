import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { getAppConfig } from "@/lib/app-config";
import { transaction } from "@/lib/db";
import { createEntry } from "@/lib/entries";
import { entryInputSchema, localDateSchema } from "@/lib/validation";
import { getEntriesInRange } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** GET /api/entries?start=YYYY-MM-DD&end=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    const params = request.nextUrl.searchParams;
    const { start, end } = z
      .object({ start: localDateSchema, end: localDateSchema })
      .parse({ start: params.get("start"), end: params.get("end") });
    return { entries: await getEntriesInRange(user.id, start, end) };
  });
}

/**
 * POST /api/entries — accepts a single entry or an array of them. The array
 * form is what the LLM confirm sheet submits, so a dictated sentence
 * containing three movements lands as one atomic request: all three, or none.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const body = await request.json();
    const payload = z.union([entryInputSchema, z.array(entryInputSchema).min(1).max(50)]).parse(body);
    const inputs = Array.isArray(payload) ? payload : [payload];
    const { timeZone } = await getAppConfig(user.id);

    const entries = await transaction(async (tx) => {
      const created = [];
      for (const input of inputs) created.push(await createEntry(user.id, timeZone, input, { db: tx }));
      return created;
    });
    return { entries };
  });
}
