import { NextRequest } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { sendToUser } from "@/lib/push";
import { hitRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/** POST /api/push/test — send a nudge now, to see that it arrives. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const limit = await hitRateLimit(`push-test:${user.id}`, 5, 60 * 60);
    if (!limit.allowed) throw new ApiError("That is enough tests for one hour.", 429, "rate-limited");
    const delivered = await sendToUser(user.id, {
      title: "Nudges are on",
      body: "This is what a snack reminder looks like. Tap it to open the app.",
      url: "/",
      tag: "snack-test",
    });
    if (delivered === 0) throw new ApiError("No device accepted it. Turn nudges on again from this device.", 409, "undelivered");
    return { delivered };
  });
}
