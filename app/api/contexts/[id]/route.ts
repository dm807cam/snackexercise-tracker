import { NextRequest } from "next/server";
import { ApiError, handle, notFound } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { formatEquipmentList } from "@/lib/snack/equipment";
import { getSetting, putSetting } from "@/lib/queries";
import { contextFieldsSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/contexts/:id — rename a place, or change what is there. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const { id } = await params;
    const input = contextFieldsSchema.partial().parse(await request.json());

    const existing = await prisma.trainingContext.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw notFound("Place");
    if (input.name && input.name !== existing.name) {
      const clash = await prisma.trainingContext.findUnique({
        where: { userId_name: { userId: user.id, name: input.name } },
        select: { id: true },
      });
      if (clash) throw new ApiError(`You already have a place called "${input.name}".`, 409);
    }

    const { equipment, ...fields } = input;
    return {
      context: await prisma.trainingContext.update({
        where: { id: existing.id },
        data: { ...fields, ...(equipment ? { equipment: formatEquipmentList(equipment) } : {}) },
      }),
    };
  });
}

/** DELETE /api/contexts/:id — remove a place. The last one stays: the planner needs somewhere. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const { id } = await params;
    const existing = await prisma.trainingContext.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw notFound("Place");

    const remaining = await prisma.trainingContext.findMany({
      where: { userId: user.id, id: { not: id } },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    });
    if (remaining.length === 0) throw new ApiError("Keep at least one place.", 409);

    await prisma.trainingContext.delete({ where: { id } });
    if ((await getSetting(user.id, "activeContextId")) === id) {
      await putSetting(user.id, "activeContextId", remaining[0].id);
    }
    return { deleted: true };
  });
}
