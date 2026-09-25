import { NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { getDaySummary } from "@/lib/queries";
import { getAppConfig } from "@/lib/app-config";
import { localDateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ date: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    const { date } = await params;
    const { timeZone, today } = await getAppConfig(user.id);
    return getDaySummary(user.id, localDateSchema.parse(date), timeZone, today);
  });
}

/** Clear a whole day. Behind a confirmation in the UI. */
export async function DELETE(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const localDate = localDateSchema.parse((await params).date);
    const { count } = await prisma.setEntry.deleteMany({ where: { userId: user.id, localDate } });
    return { deleted: count };
  });
}
