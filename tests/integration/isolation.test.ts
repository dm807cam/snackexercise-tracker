import "./harness";
import { beforeAll, describe, expect, it } from "vitest";
import { world, type World } from "./world";
import { PASSWORDS } from "./harness";
import * as entries from "@/app/api/entries/route";
import * as entry from "@/app/api/entries/[id]/route";
import * as exercises from "@/app/api/exercises/route";
import * as exercise from "@/app/api/exercises/[id]/route";
import * as days from "@/app/api/days/[date]/route";
import * as contexts from "@/app/api/contexts/route";
import * as context from "@/app/api/contexts/[id]/route";
import * as activeContext from "@/app/api/contexts/active/route";
import * as snacks from "@/app/api/snacks/route";
import * as snack from "@/app/api/snacks/[id]/route";
import * as snackStart from "@/app/api/snacks/[id]/start/route";
import * as snackSwap from "@/app/api/snacks/[id]/swap/route";
import * as snackComplete from "@/app/api/snacks/[id]/complete/route";
import * as snackSkip from "@/app/api/snacks/[id]/skip/route";
import * as settings from "@/app/api/settings/route";
import * as metrics from "@/app/api/metrics/[date]/route";
import * as exportRoute from "@/app/api/export/route";
import * as schedule from "@/app/api/schedule/route";
import * as me from "@/app/api/me/route";
import * as adminUsers from "@/app/api/admin/users/route";
import { prisma } from "@/lib/db";
import { toLocalDateInZone } from "@/lib/dates";

/**
 * One account's data is invisible to every other account, whichever route is
 * asked and however the id is obtained. A row that exists but belongs to
 * someone else answers exactly like a row that does not exist.
 */

let w: World;
let today: string;
let pushUpId: string;
let aliceEntryId: string;
let aliceExerciseId: string;
let aliceContextId: string;
let aliceSnackId: string;

beforeAll(async () => {
  w = await world();
  today = toLocalDateInZone(new Date(), "Europe/Berlin");

  const list = await w.alice.client.get(exercises.GET, "/api/exercises");
  pushUpId = list.body.exercises.find((e: { name: string }) => e.name === "Push-up").id;

  const logged = await w.alice.client.post(entries.POST, "/api/entries", {
    body: { exerciseId: pushUpId, sets: 2, reps: 12 },
  });
  expect(logged.status).toBe(200);
  aliceEntryId = logged.body.entries[0].id;

  const custom = await w.alice.client.post(exercises.POST, "/api/exercises", {
    body: { name: "Alice's odd shoulder thing", category: "bodyweight", muscles: [{ muscle: "side-delts", weight: 1 }] },
  });
  expect(custom.status).toBe(200);
  aliceExerciseId = custom.body.exercise.id;

  const places = await w.alice.client.get(contexts.GET, "/api/contexts");
  aliceContextId = places.body.contexts[0].id;

  const planned = await w.alice.client.post(snacks.POST, "/api/snacks", { body: { minutes: 3 } });
  expect(planned.status).toBe(200);
  aliceSnackId = planned.body.snack.id;
});

describe("the training log", () => {
  it("lists only your own entries", async () => {
    const mine = await w.alice.client.get(entries.GET, `/api/entries?start=${today}&end=${today}`);
    expect(mine.body.entries.map((e: { id: string }) => e.id)).toContain(aliceEntryId);

    const theirs = await w.bob.client.get(entries.GET, `/api/entries?start=${today}&end=${today}`);
    expect(theirs.status).toBe(200);
    expect(theirs.body.entries).toEqual([]);
  });

  it("answers someone else's entry exactly like a missing one", async () => {
    const edit = await w.bob.client.patch(entry.PATCH, `/api/entries/${aliceEntryId}`, {
      params: { id: aliceEntryId },
      body: { reps: 99 },
    });
    const missing = await w.bob.client.patch(entry.PATCH, "/api/entries/nope", { params: { id: "nope" }, body: { reps: 99 } });
    expect(edit.status).toBe(404);
    expect(edit.body).toEqual(missing.body);

    const remove = await w.bob.client.delete(entry.DELETE, `/api/entries/${aliceEntryId}`, { params: { id: aliceEntryId } });
    expect(remove.status).toBe(404);

    const still = await prisma.setEntry.findUnique({ where: { id: aliceEntryId } });
    expect(still?.reps).toBe(12);
  });

  it("keeps a day's summary to its owner", async () => {
    const hers = await w.alice.client.get(days.GET, `/api/days/${today}`, { params: { date: today } });
    const his = await w.bob.client.get(days.GET, `/api/days/${today}`, { params: { date: today } });
    expect(hers.body.entries.length).toBeGreaterThan(0);
    expect(his.body.entries).toEqual([]);
    expect(his.body.sets).toBe(0);
  });
});

describe("custom movements", () => {
  it("are visible to their owner only", async () => {
    const hers = await w.alice.client.get(exercises.GET, "/api/exercises");
    const his = await w.bob.client.get(exercises.GET, "/api/exercises");
    expect(hers.body.exercises.some((e: { id: string }) => e.id === aliceExerciseId)).toBe(true);
    expect(his.body.exercises.some((e: { id: string }) => e.id === aliceExerciseId)).toBe(false);
    // Both still see the shared catalogue.
    expect(his.body.exercises.some((e: { id: string }) => e.id === pushUpId)).toBe(true);
  });

  it("cannot be logged, edited or deleted by anyone else", async () => {
    const log = await w.bob.client.post(entries.POST, "/api/entries", { body: { exerciseId: aliceExerciseId, sets: 1 } });
    expect(log.status).toBe(404);

    const edit = await w.bob.client.patch(exercise.PATCH, `/api/exercises/${aliceExerciseId}`, {
      params: { id: aliceExerciseId },
      body: { name: "Mine now" },
    });
    expect(edit.status).toBe(404);
    const remove = await w.bob.client.delete(exercise.DELETE, `/api/exercises/${aliceExerciseId}`, { params: { id: aliceExerciseId } });
    expect(remove.status).toBe(404);
  });

  it("do not take a name away from anyone else", async () => {
    const same = await w.bob.client.post(exercises.POST, "/api/exercises", {
      body: { name: "Alice's odd shoulder thing", category: "bodyweight", muscles: [{ muscle: "side-delts", weight: 1 }] },
    });
    expect(same.status).toBe(200);
    expect(same.body.exercise.id).not.toBe(aliceExerciseId);
  });

  it("the shared catalogue is only an admin's to change", async () => {
    const shared = await w.bob.client.post(exercises.POST, "/api/exercises", {
      body: { name: "Bob's catalogue entry", shared: true, muscles: [{ muscle: "quads", weight: 1 }] },
    });
    expect(shared.status).toBe(403);
    const edit = await w.bob.client.patch(exercise.PATCH, `/api/exercises/${pushUpId}`, {
      params: { id: pushUpId },
      body: { name: "Bob-up" },
    });
    expect([403, 404]).toContain(edit.status);
    expect((await prisma.exercise.findUnique({ where: { id: pushUpId } }))?.name).toBe("Push-up");
  });
});

describe("places", () => {
  it("every account gets its own", async () => {
    const hers = await w.alice.client.get(contexts.GET, "/api/contexts");
    const his = await w.bob.client.get(contexts.GET, "/api/contexts");
    const herIds = new Set(hers.body.contexts.map((c: { id: string }) => c.id));
    expect(his.body.contexts.length).toBeGreaterThan(0);
    expect(his.body.contexts.some((c: { id: string }) => herIds.has(c.id))).toBe(false);
  });

  it("cannot be changed, removed or chosen by anyone else", async () => {
    const edit = await w.bob.client.patch(context.PATCH, `/api/contexts/${aliceContextId}`, {
      params: { id: aliceContextId },
      body: { name: "Bob's now" },
    });
    expect(edit.status).toBe(404);
    const remove = await w.bob.client.delete(context.DELETE, `/api/contexts/${aliceContextId}`, { params: { id: aliceContextId } });
    expect(remove.status).toBe(404);
    const choose = await w.bob.client.put(activeContext.PUT, "/api/contexts/active", { body: { contextId: aliceContextId } });
    expect(choose.status).toBe(404);
  });
});

describe("snacks", () => {
  it("someone else's planned snack cannot be read or acted on", async () => {
    const params = { id: aliceSnackId };
    expect((await w.bob.client.get(snack.GET, `/api/snacks/${aliceSnackId}`, { params })).status).toBe(404);
    expect((await w.bob.client.post(snackStart.POST, `/api/snacks/${aliceSnackId}/start`, { params })).status).toBe(404);
    expect(
      (await w.bob.client.post(snackSwap.POST, `/api/snacks/${aliceSnackId}/swap`, { params, body: { block: 0 } })).status,
    ).toBe(404);
    expect((await w.bob.client.post(snackSkip.POST, `/api/snacks/${aliceSnackId}/skip`, { params })).status).toBe(404);
    const complete = await w.bob.client.post(snackComplete.POST, `/api/snacks/${aliceSnackId}/complete`, {
      params,
      body: {
        results: [{ exerciseId: pushUpId, outcome: "done", sets: 1, reps: 5, seconds: null, weightKg: null, effort: null }],
      },
    });
    expect(complete.status).toBe(404);

    // Nothing was logged into anybody's day by trying.
    const his = await w.bob.client.get(entries.GET, `/api/entries?start=${today}&end=${today}`);
    expect(his.body.entries).toEqual([]);
    const hers = await w.alice.client.get(snack.GET, `/api/snacks/${aliceSnackId}`, { params });
    expect(hers.body.snack.status).toBe("proposed");
  });
});

describe("settings and measurements", () => {
  it("are per account", async () => {
    await w.alice.client.put(settings.PUT, "/api/settings", { body: { units: "lb", targetBouts: "8" } });
    await w.alice.client.put(metrics.PUT, `/api/metrics/${today}`, { params: { date: today }, body: { steps: 12345 } });

    const his = await w.bob.client.get(settings.GET, "/api/settings");
    expect(his.body.settings.units).toBeUndefined();
    expect(his.body.settings.targetBouts).toBeUndefined();
    const steps = await w.bob.client.get(metrics.GET, `/api/metrics/${today}`, { params: { date: today } });
    expect(steps.body.steps ?? null).toBeNull();

    const busy = await w.alice.client.put(schedule.PUT, "/api/schedule", {
      body: { busy: [{ days: 31, start: "09:00", end: "10:00", label: "Stand-up" }] },
    });
    expect(busy.status).toBe(200);
    const hisSchedule = await w.bob.client.get(schedule.GET, "/api/schedule");
    expect(hisSchedule.body.busy).toEqual([]);
  });
});

describe("export", () => {
  it("carries your own data and none of anyone else's", async () => {
    const his = await w.bob.client.get(exportRoute.GET, "/api/export");
    expect(his.status).toBe(200);
    const text = JSON.stringify(his.body);
    expect(text).not.toContain("alice@example.com");
    expect(his.body.entries).toEqual([]);
    expect(his.body.exercises.filter((e: { mine: boolean }) => e.mine).map((e: { name: string }) => e.name)).toEqual([
      "Alice's odd shoulder thing", // Bob's own, same name
    ]);

    const hers = await w.alice.client.get(exportRoute.GET, "/api/export");
    expect(hers.body.entries.length).toBeGreaterThan(0);
    expect(hers.body.account.email).toBe("alice@example.com");
  });
});

describe("administration", () => {
  it("is refused to members", async () => {
    const list = await w.alice.client.get(adminUsers.GET, "/api/admin/users");
    expect(list.status).toBe(403);
  });

  it("shows an admin counts, never content", async () => {
    const list = await w.admin.client.get(adminUsers.GET, "/api/admin/users");
    expect(list.status).toBe(200);
    const alice = list.body.users.find((u: { email: string }) => u.email === "alice@example.com");
    expect(alice.entries).toBeGreaterThan(0);
    expect(JSON.stringify(list.body)).not.toMatch(/passwordHash|Push-up|shoulder/);
  });
});

describe("deleting an account", () => {
  it("takes that account's data and nobody else's", async () => {
    const wrong = await w.bob.client.delete(me.DELETE, "/api/me", { body: { password: "not it at all" } });
    expect(wrong.status).toBe(403);

    const gone = await w.bob.client.delete(me.DELETE, "/api/me", { body: { password: PASSWORDS.bob } });
    expect(gone.status).toBe(200);
    expect(await prisma.user.findUnique({ where: { id: w.bob.id } })).toBeNull();
    expect(await prisma.setEntry.count({ where: { userId: w.bob.id } })).toBe(0);
    expect(await prisma.exercise.count({ where: { ownerId: w.bob.id } })).toBe(0);
    expect(await prisma.trainingContext.count({ where: { userId: w.bob.id } })).toBe(0);

    // Their session died with them.
    expect((await w.bob.client.get(me.GET, "/api/me")).status).toBe(401);
    // Alice is untouched.
    expect(await prisma.setEntry.count({ where: { userId: w.alice.id } })).toBeGreaterThan(0);
    expect(await prisma.exercise.findUnique({ where: { id: aliceExerciseId } })).not.toBeNull();
  });
});
