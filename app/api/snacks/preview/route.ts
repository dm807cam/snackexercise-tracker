import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { previewSnack, snackRequestSchema } from "@/lib/snack/service";

export const dynamic = "force-dynamic";

/**
 * GET /api/snacks/preview?minutes=3&focus=auto&contextId=…&nonce=0 — what a
 * snack would be, without keeping it. The day page's card calls this as the
 * minutes, the place or the focus change.
 */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    const params = request.nextUrl.searchParams;
    const snackRequest = snackRequestSchema.parse({
      minutes: params.has("minutes") ? Number(params.get("minutes")) : undefined,
      focus: params.get("focus") ?? undefined,
      contextId: params.get("contextId") ?? undefined,
      nonce: params.has("nonce") ? Number(params.get("nonce")) : undefined,
    });
    return previewSnack(user.id, snackRequest);
  });
}
