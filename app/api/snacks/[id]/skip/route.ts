import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { skipSnack } from "@/lib/snack/service";
import { count } from "@/lib/metrics";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/snacks/:id/skip — not now. */
export async function POST(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const snack = await skipSnack(user.id, (await params).id);
    count("snack_snacks_finished_total", { outcome: "skipped" });
    return { snack };
  });
}
