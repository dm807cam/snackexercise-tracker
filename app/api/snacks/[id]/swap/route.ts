import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { swapInSnack } from "@/lib/snack/service";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  block: z.union([z.number().int().min(0).max(11), z.literal("finisher")]),
});

/** POST /api/snacks/:id/swap — `{ block: index | "finisher" }`: something else for the same job. */
export async function POST(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const { block } = bodySchema.parse(await request.json());
    const snack = await swapInSnack(user.id, (await params).id, block === "finisher" ? "finisher" : { index: block });
    return { snack };
  });
}
