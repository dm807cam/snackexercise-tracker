import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { peekLink } from "@/lib/auth/links";

export const dynamic = "force-dynamic";

/** GET /api/auth/invite?token=… — whether an invitation is still good, and for whom. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const link = await peekLink(request.nextUrl.searchParams.get("token") ?? "", "invite");
    return link ? { valid: true, email: link.email, expiresAt: link.expiresAt } : { valid: false };
  });
}
