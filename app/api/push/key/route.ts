import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { vapidKeys } from "@/lib/push";

export const dynamic = "force-dynamic";

/** GET /api/push/key — the public key a browser subscribes with. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    await authenticate(request, { sessionOnly: true });
    return { publicKey: (await vapidKeys()).publicKey };
  });
}
