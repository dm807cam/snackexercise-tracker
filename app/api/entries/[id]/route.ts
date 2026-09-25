import { NextRequest } from "next/server";
import { handle, notFound } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { prisma } from "@/lib/db";
import { entryExerciseSelect } from "@/lib/entries";
import { entryUpdateSchema } from "@/lib/validation";
import { formatTime, toLocalDateInZone, zonedDateTimeToInstant } from "@/lib/dates";
import { getAppConfig } from "@/lib/app-config";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const { id } = await params;
    const patch = entryUpdateSchema.parse(await request.json());

    // Scoped by owner: somebody else's entry id is simply not found.
    const existing = await prisma.setEntry.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw notFound("Entry");

    const { timeZone } = await getAppConfig(user.id);
    const { performedTime, performedAt: patchedInstant, localDate: patchedDate, ...fields } = patch;

    // Retiming an entry — the run you did at 06:30 and only logged at 21:00 —
    // arrives as the digits the user typed plus the day they belong to, and is
    // resolved against the user's configured zone rather than the browser's.
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
        where: { id: existing.id },
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
        include: { exercise: { select: entryExerciseSelect } },
      }),
    };
  });
}

export async function DELETE(request: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "entries:write" });
    const { id } = await params;
    const existing = await prisma.setEntry.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw notFound("Entry");
    await prisma.setEntry.delete({ where: { id: existing.id } });
    // Return the deleted row so the client can offer a genuine undo rather than
    // just hiding it optimistically.
    return { deleted: existing };
  });
}
