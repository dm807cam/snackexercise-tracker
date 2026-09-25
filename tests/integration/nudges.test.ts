import "./harness";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { world, type World } from "./world";

// Web Push is the one thing that leaves the building; everything up to the
// hand-off is real. The stub records what would have been sent.
const sent: { userId: string; payload: { title: string; body: string; url: string; tag: string; snackId?: string } }[] = [];
vi.mock("@/lib/push", () => ({
  sendToUser: vi.fn(async (userId: string, payload: (typeof sent)[number]["payload"]) => {
    sent.push({ userId, payload });
    return 1;
  }),
  vapidKeys: vi.fn(async () => ({ publicKey: "test", privateKey: "test" })),
}));

import * as subscriptions from "@/app/api/push/subscriptions/route";
import * as schedule from "@/app/api/schedule/route";
import * as pause from "@/app/api/nudges/pause/route";
import * as snooze from "@/app/api/nudges/snooze/route";
import * as snackStart from "@/app/api/snacks/[id]/start/route";
import { nudgeUser, runNudges } from "@/lib/jobs/nudges";
import { acquireLease, releaseLease } from "@/lib/jobs/lease";
import { prisma } from "@/lib/db";
import { toLocalDateInZone, zonedDateTimeToInstant } from "@/lib/dates";

/**
 * The proactive core: with nudges on, the scheduler decides when a snack is
 * due, plans it for that moment, and sends it — once, however many replicas
 * run the job — and then stays quiet until the plan says otherwise.
 */

let w: World;
let today: string;
const at = (time: string) => zonedDateTimeToInstant(today, time, "Europe/Berlin");

async function subscribe(client: World["alice"]["client"], endpoint: string) {
  const result = await client.post(subscriptions.POST, "/api/push/subscriptions", {
    body: { endpoint, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } },
  });
  expect(result.status).toBe(200);
}

beforeAll(async () => {
  w = await world();
  today = toLocalDateInZone(new Date(), "Europe/Berlin");
});

beforeEach(async () => {
  sent.length = 0;
  await prisma.nudge.deleteMany({});
  await prisma.snack.deleteMany({});
  await prisma.setting.deleteMany({ where: { key: { in: ["nudgesPausedUntil", "nudgeSnoozedUntil"] } } });
});

describe("before anyone asks", () => {
  it("nothing is sent: nudges are off until a device is subscribed", async () => {
    expect(await nudgeUser(w.alice.id, at("10:30"))).toBe("off");
    expect(await runNudges(at("10:30"))).toEqual({ users: 0, sent: 0 });
    expect(sent).toEqual([]);
  });
});

describe("once a device is subscribed", () => {
  beforeAll(async () => {
    await subscribe(w.alice.client, "https://push.example.com/alice-phone");
  });

  it("sends one nudge when a snack comes due, with a plan ready to start", async () => {
    // Nothing logged, and the day is past its first slot: due now.
    expect(await nudgeUser(w.alice.id, at("10:30"))).toBe("sent");
    expect(sent).toHaveLength(1);
    expect(sent[0].userId).toBe(w.alice.id);
    expect(sent[0].payload.title).toBe("Time for a snack");

    const snackId = sent[0].payload.snackId!;
    expect(sent[0].payload.url).toBe(`/snack/${snackId}`);
    const snack = await prisma.snack.findUniqueOrThrow({ where: { id: snackId } });
    expect(snack.userId).toBe(w.alice.id);
    expect(snack.trigger).toBe("nudge");

    // The nudged snack is the user's to start, like any other.
    const started = await w.alice.client.post(snackStart.POST, `/api/snacks/${snackId}/start`, { params: { id: snackId } });
    expect(started.status).toBe(200);
  });

  it("does not repeat itself a minute later", async () => {
    expect(await nudgeUser(w.alice.id, at("10:30"))).toBe("sent");
    expect(await nudgeUser(w.alice.id, at("10:31"))).toBe("not-due");
    expect(sent).toHaveLength(1);
  });

  it("follows up once, 45 minutes on, if nothing was done", async () => {
    await nudgeUser(w.alice.id, at("10:30"));
    expect(await nudgeUser(w.alice.id, at("11:14"))).toBe("not-due");
    expect(await nudgeUser(w.alice.id, at("11:15"))).toBe("sent");
    expect(sent[1].payload.title).toBe("A snack is still waiting");
    expect(await nudgeUser(w.alice.id, at("12:30"))).toBe("not-due");
  });

  it("sends exactly once however many replicas run the job at the same moment", async () => {
    const outcomes = await Promise.all([
      nudgeUser(w.alice.id, at("10:30")),
      nudgeUser(w.alice.id, at("10:30")),
      nudgeUser(w.alice.id, at("10:30")),
    ]);
    expect(outcomes.filter((o) => o === "sent")).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(await prisma.nudge.count({ where: { userId: w.alice.id } })).toBe(1);
  });

  it("stays quiet mid-snack", async () => {
    await nudgeUser(w.alice.id, at("10:30"));
    const snackId = sent[0].payload.snackId!;
    await w.alice.client.post(snackStart.POST, `/api/snacks/${snackId}/start`, { params: { id: snackId } });
    expect(await nudgeUser(w.alice.id, at("11:15"))).toBe("in-progress");
  });

  it("stays quiet in busy time, and comes when it ends", async () => {
    const busy = await w.alice.client.put(schedule.PUT, "/api/schedule", {
      body: { busy: [{ days: 127, start: "10:00", end: "11:00", label: "Stand-up" }] },
    });
    expect(busy.status).toBe(200);
    expect(await nudgeUser(w.alice.id, at("10:30"))).toBe("not-due");
    expect(await nudgeUser(w.alice.id, at("11:00"))).toBe("sent");
    await w.alice.client.put(schedule.PUT, "/api/schedule", { body: { busy: [] } });
  });

  it("waits out a pause, and a snooze", async () => {
    await w.alice.client.post(pause.POST, "/api/nudges/pause", { body: { hours: 24 } });
    expect(await nudgeUser(w.alice.id, new Date())).not.toBe("sent");
    await w.alice.client.post(pause.POST, "/api/nudges/pause", { body: { hours: null } });

    // "In 30 minutes" from the notification: the next one comes then, even
    // with follow-ups off.
    await w.alice.client.put(schedule.PUT, "/api/schedule", { body: { followUp: false } });
    const now = new Date();
    await nudgeUser(w.alice.id, now);
    const snoozed = await w.alice.client.post(snooze.POST, "/api/nudges/snooze", { body: { minutes: 30 } });
    expect(snoozed.status).toBe(200);
    expect(await nudgeUser(w.alice.id, new Date(now.getTime() + 29 * 60_000))).not.toBe("sent");
    await w.alice.client.put(schedule.PUT, "/api/schedule", { body: { followUp: true } });
  });

  it("only goes to the person who subscribed, whoever else is on the instance", async () => {
    await runNudges(at("10:30"));
    expect(sent.every((s) => s.userId === w.alice.id)).toBe(true);
  });

  it("a device someone else subscribes last is theirs, not Alice's", async () => {
    await subscribe(w.bob.client, "https://push.example.com/alice-phone");
    const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: "https://push.example.com/alice-phone" } });
    expect(row.userId).toBe(w.bob.id);
    // Alice has no device left, so nothing is sent to her.
    expect(await prisma.pushSubscription.count({ where: { userId: w.alice.id } })).toBe(0);
  });
});

describe("job leases", () => {
  it("one holder at a time, and free again once released or expired", async () => {
    const now = new Date();
    expect(await acquireLease("test-job", 60_000, now, "replica-a")).toBe(true);
    expect(await acquireLease("test-job", 60_000, now, "replica-b")).toBe(false);
    // The holder renews.
    expect(await acquireLease("test-job", 60_000, now, "replica-a")).toBe(true);
    // After it lapses, someone else may take it.
    expect(await acquireLease("test-job", 60_000, new Date(now.getTime() + 61_000), "replica-b")).toBe(true);
    await releaseLease("test-job", "replica-b");
    expect(await acquireLease("test-job", 60_000, now, "replica-c")).toBe(true);
  });
});
