import "./harness";
import { beforeAll, describe, expect, it } from "vitest";
import { Client, ORIGIN } from "./harness";
import { world, type World } from "./world";
import * as tokens from "@/app/api/me/tokens/route";
import * as token from "@/app/api/me/tokens/[id]/route";
import * as entries from "@/app/api/entries/route";
import * as metrics from "@/app/api/metrics/[date]/route";
import * as me from "@/app/api/me/route";
import * as schedule from "@/app/api/schedule/route";
import * as subscriptions from "@/app/api/push/subscriptions/route";
import * as adminUsers from "@/app/api/admin/users/route";
import * as adminUser from "@/app/api/admin/users/[id]/route";
import * as feed from "@/app/api/calendar/feed/route";
import { prisma } from "@/lib/db";
import { toLocalDateInZone } from "@/lib/dates";

/**
 * API tokens are for automations, so they are DEFAULT DENY: a token can reach
 * only a route that names a scope it holds, never account management, and
 * never by falling back to a browser's cookie.
 */

let w: World;
let today: string;

async function issue(client: Client, scopes: string[], name = "Test token") {
  const result = await client.post(tokens.POST, "/api/me/tokens", { body: { name, scopes } });
  expect(result.status).toBe(200);
  return result.body as { token: string; id: string };
}

beforeAll(async () => {
  w = await world();
  today = toLocalDateInZone(new Date(), "Europe/Berlin");
});

describe("issuing", () => {
  it("shows the secret once and keeps only its hash", async () => {
    const { token: secret, id } = await issue(w.alice.client, ["read"]);
    expect(secret).toMatch(/^snk_/);

    const list = await w.alice.client.get(tokens.GET, "/api/me/tokens");
    expect(JSON.stringify(list.body)).not.toContain(secret);
    const row = await prisma.apiToken.findUniqueOrThrow({ where: { id } });
    expect(row.tokenHash).not.toContain(secret);
    expect(JSON.stringify(row)).not.toContain(secret.slice(12));
  });

  it("needs a signed-in browser: a token cannot mint tokens", async () => {
    const { token: secret } = await issue(w.alice.client, ["read", "entries:write", "metrics:write", "calendar:read"]);
    const script = Client.withToken(secret);
    const minted = await script.post(tokens.POST, "/api/me/tokens", { body: { name: "More", scopes: ["read"] } });
    expect(minted.status).toBe(403);
    expect((await script.get(me.GET, "/api/me")).status).toBe(200);
    expect((await script.patch(me.PATCH, "/api/me", { body: { name: "Changed by a script" } })).status).toBe(403);
  });
});

describe("scopes", () => {
  it("a read token reads and does nothing else", async () => {
    const script = Client.withToken((await issue(w.alice.client, ["read"])).token);
    expect((await script.get(entries.GET, `/api/entries?start=${today}&end=${today}`)).status).toBe(200);

    const write = await script.post(entries.POST, "/api/entries", { noOrigin: true, body: { exerciseName: "Push-up", sets: 1 } });
    expect(write.status).toBe(403);
    expect(write.body.code).toBe("insufficient-scope");
    const steps = await script.put(metrics.PUT, `/api/metrics/${today}`, {
      noOrigin: true,
      params: { date: today },
      body: { steps: 4000 },
    });
    expect(steps.status).toBe(403);
  });

  it("a steps token records steps, from a script with no Origin, and reads nothing", async () => {
    const script = Client.withToken((await issue(w.alice.client, ["metrics:write"], "Steps Shortcut")).token);
    const steps = await script.put(metrics.PUT, `/api/metrics/${today}`, {
      noOrigin: true,
      params: { date: today },
      body: { steps: 8765, source: "shortcut" },
    });
    expect(steps.status).toBe(200);
    expect((await script.get(entries.GET, `/api/entries?start=${today}&end=${today}`)).status).toBe(403);
  });

  it("an entries token logs entries", async () => {
    const script = Client.withToken((await issue(w.alice.client, ["entries:write"])).token);
    const logged = await script.post(entries.POST, "/api/entries", { noOrigin: true, body: { exerciseName: "Push-up", sets: 1, reps: 5 } });
    expect(logged.status).toBe(200);
    expect(logged.body.entries[0].userId).toBe(w.alice.id);
  });

  it("routes that name no scope refuse every token", async () => {
    const script = Client.withToken(
      (await issue(w.alice.client, ["read", "entries:write", "metrics:write", "calendar:read"])).token,
    );
    expect((await script.put(schedule.PUT, "/api/schedule", { noOrigin: true, body: { followUp: false } })).status).toBe(403);
    expect(
      (
        await script.post(subscriptions.POST, "/api/push/subscriptions", {
          noOrigin: true,
          body: { endpoint: "https://push.example.com/abc", keys: { p256dh: "x", auth: "y" } },
        })
      ).status,
    ).toBe(403);
  });

  it("an admin's token cannot administer", async () => {
    const script = Client.withToken(
      (await issue(w.admin.client, ["read", "entries:write", "metrics:write", "calendar:read"])).token,
    );
    expect((await script.get(adminUsers.GET, "/api/admin/users")).status).toBe(403);
  });
});

describe("a token that is not good", () => {
  it("never falls back to the cookie beside it", async () => {
    const mixed = new Client({ authorization: "Bearer snk_not_a_real_token_at_all_000000000" });
    mixed.cookies.set("snack_session", w.alice.client.cookies.get("snack_session")!);
    expect((await mixed.get(me.GET, "/api/me")).status).toBe(401);
  });

  it("stops working the moment it is revoked", async () => {
    const { token: secret, id } = await issue(w.alice.client, ["read"]);
    const script = Client.withToken(secret);
    expect((await script.get(me.GET, "/api/me")).status).toBe(200);

    expect((await w.bob.client.delete(token.DELETE, `/api/me/tokens/${id}`, { params: { id } })).status).toBe(404);
    expect((await script.get(me.GET, "/api/me")).status).toBe(200);

    expect((await w.alice.client.delete(token.DELETE, `/api/me/tokens/${id}`, { params: { id } })).status).toBe(200);
    expect((await script.get(me.GET, "/api/me")).status).toBe(401);
  });

  it("stops at its expiry, and with its owner's account", async () => {
    const expiring = await issue(w.bob.client, ["read"]);
    await prisma.apiToken.update({ where: { id: expiring.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await Client.withToken(expiring.token).get(me.GET, "/api/me")).status).toBe(401);

    const live = await issue(w.bob.client, ["read"]);
    const script = Client.withToken(live.token);
    expect((await script.get(me.GET, "/api/me")).status).toBe(200);
    await w.admin.client.patch(adminUser.PATCH, `/api/admin/users/${w.bob.id}`, { params: { id: w.bob.id }, body: { disabled: true } });
    expect((await script.get(me.GET, "/api/me")).status).toBe(401);
    await w.admin.client.patch(adminUser.PATCH, `/api/admin/users/${w.bob.id}`, { params: { id: w.bob.id }, body: { disabled: false } });
  });
});

describe("the calendar feed", () => {
  it("serves the plan to a calendar:read token in the URL", async () => {
    const { token: secret } = await issue(w.alice.client, ["calendar:read"], "Calendar");
    const calendar = new Client();
    const result = await calendar.get(feed.GET, `/api/calendar/feed?token=${secret}`);
    expect(result.status).toBe(200);
    expect(result.headers.get("content-type")).toMatch(/^text\/calendar/);
    expect(result.text).toContain("BEGIN:VCALENDAR");
    expect(result.text).toContain("BEGIN:VEVENT");
    expect(result.text).toContain(`${ORIGIN}/`);
    expect(result.text).not.toContain("alice@example.com");
  });

  it("takes no other scope, and never a cookie", async () => {
    const { token: readOnly } = await issue(w.alice.client, ["read"]);
    expect((await new Client().get(feed.GET, `/api/calendar/feed?token=${readOnly}`)).status).toBe(403);
    expect((await w.alice.client.get(feed.GET, "/api/calendar/feed")).status).toBe(401);
  });
});
