import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { completeSnack, completionSchema } from "@/lib/snack/service";
import { count } from "@/lib/metrics";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/snacks/:id/complete — `{ results: [...] }`, one per block, as the
 * user actually did it. Logged entries come back so the page can offer undo.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const { results } = completionSchema.parse(await request.json());
    const result = await completeSnack(user.id, (await params).id, results);
    count("snack_snacks_finished_total", { outcome: "completed" });
    return result;
  });
}
