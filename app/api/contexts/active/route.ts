import { NextRequest } from "next/server";
import { z } from "zod";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { setActiveContext } from "@/lib/snack/service";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ contextId: z.string().min(1).max(40) });

/** PUT /api/contexts/active — "I'm in the hotel now". */
export async function PUT(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const { contextId } = bodySchema.parse(await request.json());
    await setActiveContext(user.id, contextId);
    return { activeId: contextId };
  });
}
