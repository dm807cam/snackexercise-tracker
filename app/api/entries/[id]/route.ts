import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { ApiError, handle } from "@/lib/api";
import { prisma } from "@/lib/db";
import { entryUpdateSchema } from "@/lib/validation";
import { formatTime, toLocalDateInZone, zonedDateTimeToInstant } from "@/lib/dates";
import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { id } = await params;
    const patch = entryUpdateSchema.parse(await request.json());

    const existing = await prisma.setEntry.findUnique({ where: { id } });
    if (!existing) throw new ApiError("Entry not found", 404);

    const { timeZone } = await getAppConfig();
    const { performedTime, performedAt: patchedInstant, localDate: patchedDate, ...fields } = patch;

    // Retiming an entry — the run you did at 06:30 and only logged at 21:00 —
    // arrives as the digits the user typed plus the day they belong to, and is
    // resolved against the app's configured zone rather than the browser's.
    //
    // Either half may arrive alone. A day on its own moves the entry to that
    // day at the clock time it already had, which is the only reading of
    // "put this on Tuesday" that does not throw information away; the
    // alternative was accepting the field and writing nothing.
    const day = patchedDate ?? existing.localDate;
    const time =
      performedTime ??
      (patchedDate ? formatTime(existing.performedAt, timeZone) : undefined);

    const performedAt = time
      ? zonedDateTimeToInstant(day, time, timeZone)
      : patchedInstant
        ? new Date(patchedInstant)
        : undefined;

    return {
      entry: await prisma.setEntry.update({
        where: { id },
        data: {
          ...fields,
          performedAt,
          // Moving an entry's time can move it to a different day. A stated day
          // is authoritative; otherwise it follows the instant.
          localDate: time
            ? day
            : performedAt
              ? toLocalDateInZone(performedAt, timeZone)
              : undefined,
        },
        include: {
          exercise: {
            select: {
              id: true,
              name: true,
              slug: true,
              bodyweight: true,
              cardioBias: true,
              mets: true,
              muscles: { select: { muscle: true, weight: true } },
            },
          },
        },
      }),
    };
  });
}

export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const existing = await prisma.setEntry.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Entry not found" }, { status: 404 });
  }
  await prisma.setEntry.delete({ where: { id } });
  // Return the deleted row so the client can offer a genuine undo rather than
  // just hiding it optimistically.
  return NextResponse.json({ deleted: existing });
}
