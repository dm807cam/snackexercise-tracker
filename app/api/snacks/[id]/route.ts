import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { findSnack, snackView } from "@/lib/snack/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    return { snack: snackView(await findSnack(user.id, (await params).id)) };
  });
}
