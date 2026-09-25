import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { CONTEXT_KINDS, CONTEXT_PRESETS, presetRow } from "@/lib/snack/contexts";
import { formatEquipmentList } from "@/lib/snack/equipment";
import { contextFieldsSchema } from "@/lib/validation";
import { getContexts } from "@/lib/snack/service";

export const dynamic = "force-dynamic";

const MAX_CONTEXTS = 20;

/** GET /api/contexts — your places, which is active, and the presets new ones start from. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    const { contexts, activeId } = await getContexts(user.id);
    return { contexts, activeId, presets: CONTEXT_PRESETS };
  });
}

const createSchema = z.union([
  z.object({ preset: z.enum(CONTEXT_KINDS as [string, ...string[]]), name: z.string().trim().min(1).max(40).optional() }),
  contextFieldsSchema,
]);

/** POST /api/contexts — add a place, from a preset or described in full. */
export async function POST(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const input = createSchema.parse(await request.json());

    const count = await prisma.trainingContext.count({ where: { userId: user.id } });
    if (count >= MAX_CONTEXTS) throw new ApiError(`At most ${MAX_CONTEXTS} places.`, 409);

    const data =
      "preset" in input
        ? { ...presetRow(input.preset as keyof typeof CONTEXT_PRESETS, count), ...(input.name ? { name: input.name } : {}) }
        : { ...input, equipment: formatEquipmentList(input.equipment), sortOrder: count };

    const clash = await prisma.trainingContext.findUnique({
      where: { userId_name: { userId: user.id, name: data.name } },
      select: { id: true },
    });
    if (clash) throw new ApiError(`You already have a place called "${data.name}".`, 409);

    return { context: await prisma.trainingContext.create({ data: { ...data, userId: user.id } }) };
  });
}
