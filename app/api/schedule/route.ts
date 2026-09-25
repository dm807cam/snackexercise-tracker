import { NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle } from "@/lib/api";
import { authenticate } from "@/lib/auth/guard";
import { transaction } from "@/lib/db";
import { putSetting } from "@/lib/queries";
import { timeOfDaySchema } from "@/lib/validation";
import { ALL_DAYS } from "@/lib/snack/schedule";
import { todaySchedule } from "@/lib/snack/schedule-service";

export const dynamic = "force-dynamic";

/** GET /api/schedule — today's planned snacks, nudge settings and busy times. */
export async function GET(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { scope: "read" });
    return todaySchedule(user.id);
  });
}

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

const busySchema = z
  .object({
    days: z.number().int().min(1).max(ALL_DAYS),
    start: timeOfDaySchema,
    end: z.union([timeOfDaySchema, z.literal("24:00")]),
    label: z.string().trim().max(40).nullish(),
  })
  .refine((b) => minutesOf(b.end) > minutesOf(b.start), { message: "A busy time must end after it starts" });

const putSchema = z.object({
  /** Nudges are switched ON by subscribing a device; this can only switch them off. */
  nudges: z.literal(false).optional(),
  followUp: z.boolean().optional(),
  maxPerDay: z.number().int().min(1).max(24).optional(),
  days: z.number().int().min(1).max(ALL_DAYS).optional(),
  /** The whole list, replacing what is there. */
  busy: z.array(busySchema).max(30).optional(),
});

/** PUT /api/schedule — change how and when nudges come. */
export async function PUT(request: NextRequest) {
  return handle(async () => {
    const { user } = await authenticate(request, { sessionOnly: true });
    const input = putSchema.parse(await request.json());

    if (input.nudges === false) await putSetting(user.id, "nudges", "off");
    if (input.followUp !== undefined) await putSetting(user.id, "nudgeFollowUp", input.followUp ? "on" : "off");
    if (input.maxPerDay !== undefined) await putSetting(user.id, "nudgeMaxPerDay", String(input.maxPerDay));
    if (input.days !== undefined) {
      if (input.days === 0) throw new ApiError("Pick at least one day, or turn nudges off", 400);
      await putSetting(user.id, "nudgeDays", String(input.days));
    }
    if (input.busy) {
      const busy = input.busy;
      await transaction(async (tx) => {
        await tx.busyBlock.deleteMany({ where: { userId: user.id } });
        for (const block of busy) {
          await tx.busyBlock.create({
            data: {
              userId: user.id,
              days: block.days,
              startMin: minutesOf(block.start),
              endMin: minutesOf(block.end),
              label: block.label ?? null,
            },
          });
        }
      });
    }
    return todaySchedule(user.id);
  });
}
