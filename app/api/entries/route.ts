import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { createEntry } from "@/lib/entries";
import { entryInputSchema, localDateSchema } from "@/lib/validation";
import { getEntriesInRange } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** GET /api/entries?start=YYYY-MM-DD&end=YYYY-MM-DD */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const params = request.nextUrl.searchParams;
    const { start, end } = z
      .object({ start: localDateSchema, end: localDateSchema })
      .parse({ start: params.get("start"), end: params.get("end") });
    return { entries: await getEntriesInRange(start, end) };
  });
}

/**
 * POST /api/entries — accepts a single entry or an array of them. The array
 * form is what the LLM confirm sheet submits, so a dictated sentence
 * containing three movements lands as one atomic request.
 */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const body = await request.json();
    const payload = z.union([entryInputSchema, z.array(entryInputSchema).min(1).max(50)]).parse(body);
    const inputs = Array.isArray(payload) ? payload : [payload];

    const created = [];
    for (const input of inputs) created.push(await createEntry(input));
    return { entries: created };
  });
}
