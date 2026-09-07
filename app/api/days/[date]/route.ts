import { NextRequest, NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getDaySummary } from "@/lib/queries";
import { getAppConfig } from "@/lib/app-config";
import { localDateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ date: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { date } = await params;
    const { timeZone } = await getAppConfig();
    return getDaySummary(localDateSchema.parse(date), timeZone);
  });
}

/** Clear a whole day. Behind a confirmation in the UI. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { date } = await params;
  const parsed = localDateSchema.safeParse(date);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }
  const removed = await prisma.setEntry.findMany({ where: { localDate: parsed.data } });
  await prisma.setEntry.deleteMany({ where: { localDate: parsed.data } });
  return NextResponse.json({ deleted: removed.length });
}
