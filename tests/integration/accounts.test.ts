import "./harness";
import { beforeAll, describe, expect, it } from "vitest";
import { Client, PASSWORDS } from "./harness";
import { invite, signUp, world, type World } from "./world";
import * as setup from "@/app/api/auth/setup/route";
import * as signup from "@/app/api/auth/signup/route";
import * as login from "@/app/api/auth/login/route";
import * as logout from "@/app/api/auth/logout/route";
import * as reset from "@/app/api/auth/reset/route";
import * as me from "@/app/api/me/route";
import * as password from "@/app/api/me/password/route";
import * as sessions from "@/app/api/me/sessions/route";
import * as session from "@/app/api/me/sessions/[id]/route";
import * as entries from "@/app/api/entries/route";
import * as adminSettings from "@/app/api/admin/settings/route";
import * as adminUser from "@/app/api/admin/users/[id]/route";
import * as adminReset from "@/app/api/admin/users/[id]/reset/route";
import * as adminAudit from "@/app/api/admin/audit/route";

let w: World;

beforeAll(async () => {
  w = await world();
});

async function signIn(email: string, pass: string, headers: Record<string, string> = {}) {
  const client = new Client(headers);
  const result = await client.post(login.POST, "/api/auth/login", { body: { email, password: pass } });
  return { client, result };
}

describe("setting up an instance", () => {
  it("happens once", async () => {
    const again = await new Client().post(setup.POST, "/api/auth/setup", {
      body: { email: "intruder@example.com", password: "a perfectly long passphrase" },
    });
    expect(again.status).toBe(409);
  });
});

describe("who can sign up", () => {
  it("by default, only someone holding an invitation", async () => {
    const uninvited = await new Client().post(signup.POST, "/api/auth/signup", {
      body: { email: "stranger@example.com", password: "a perfectly long passphrase" },
    });
    expect(uninvited.status).toBe(403);
    expect(uninvited.body.code).toBe("invite-only");
  });

  it("an addressed invitation works for that address only, and only once", async () => {
    const token = await invite(w.admin.client, "carol@example.com");
    const wrongPerson = await new Client().post(signup.POST, "/api/auth/signup", {
      body: { email: "mallory@example.com", password: "a perfectly long passphrase", invite: token },
    });
    expect(wrongPerson.status).toBe(403);

    await signUp("carol@example.com", "a perfectly long passphrase", token);
    const reused = await new Client().post(signup.POST, "/api/auth/signup", {
      body: { email: "carol@example.com", password: "a perfectly long passphrase", invite: token },
    });
    expect(reused.status).toBe(410);
  });

  it("an admin invitation makes an admin", async () => {
    const token = await invite(w.admin.client, "dana@example.com", "admin");
    const dana = await signUp("dana@example.com", "a perfectly long passphrase", token);
    const profile = await dana.client.get(me.GET, "/api/me");
    expect(profile.body.user.role).toBe("admin");
  });

  it("follows the mode an admin sets, and invitations work even when closed", async () => {
    const open = await w.admin.client.put(adminSettings.PUT, "/api/admin/settings", { body: { registration: "open" } });
    expect(open.status).toBe(200);
    const walkIn = await new Client().post(signup.POST, "/api/auth/signup", {
      body: { email: "erin@example.com", password: "a perfectly long passphrase" },
    });
    expect(walkIn.status).toBe(200);

    await w.admin.client.put(adminSettings.PUT, "/api/admin/settings", { body: { registration: "closed" } });
    const refused = await new Client().post(signup.POST, "/api/auth/signup", {
      body: { email: "frank@example.com", password: "a perfectly long passphrase" },
    });
    expect(refused.status).toBe(403);
    await signUp("frank@example.com", "a perfectly long passphrase", await invite(w.admin.client));

    await w.admin.client.put(adminSettings.PUT, "/api/admin/settings", { body: { registration: "invite" } });
  });

  it("refuses a weak password, and says why", async () => {
    const token = await invite(w.admin.client);
    const weak = await new Client().post(signup.POST, "/api/auth/signup", {
      body: { email: "gus@example.com", password: "password123", invite: token },
    });
    expect(weak.status).toBe(400);
    expect(weak.body.error).toBeTruthy();
  });
});

describe("signing in", () => {
  it("gives one answer for every kind of failure", async () => {
    const wrong = await signIn("alice@example.com", "not her password at all");
    const nobody = await signIn("nobody@example.com", "not anyone's password");
    expect(wrong.result.status).toBe(401);
    expect(nobody.result.status).toBe(401);
    expect(wrong.result.body).toEqual(nobody.result.body);
  });

  it("refuses a sign-in posted from another site", async () => {
    const { result } = await signIn("alice@example.com", PASSWORDS.alice, { origin: "https://evil.example" });
    expect(result.status).toBe(403);
  });

  it("slows down guessing at one account from one address", async () => {
    const from = { "x-forwarded-for": "203.0.113.9" };
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await signIn("carol@example.com", `guess number ${i} is wrong`, from)).result.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses[10]).toBe(429);
    // Carol herself, from elsewhere, is not locked out.
    const elsewhere = await signIn("carol@example.com", "a perfectly long passphrase", { "x-forwarded-for": "198.51.100.4" });
    expect(elsewhere.result.status).toBe(200);
  });
});

describe("sessions", () => {
  it("a cookie from another site cannot change anything", async () => {
    const forged = await w.alice.client.post(entries.POST, "/api/entries", {
      headers: { origin: "https://evil.example" },
      body: { exerciseName: "Push-up", sets: 1 },
    });
    expect(forged.status).toBe(403);
    const fetchMeta = await w.alice.client.post(entries.POST, "/api/entries", {
      headers: { "sec-fetch-site": "cross-site" },
      body: { exerciseName: "Push-up", sets: 1 },
    });
    expect(fetchMeta.status).toBe(403);
  });

  it("can be listed and ended one by one, or all but this one", async () => {
    const phone = (await signIn("carol@example.com", "a perfectly long passphrase")).client;
    const laptop = (await signIn("carol@example.com", "a perfectly long passphrase")).client;

    const list = await laptop.get(sessions.GET, "/api/me/sessions");
    const other = list.body.sessions.find((s: { current: boolean }) => !s.current);
    expect(list.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);

    // Ending the phone's session from the laptop signs the phone out.
    const phoneSessions = await phone.get(sessions.GET, "/api/me/sessions");
    const phoneId = phoneSessions.body.sessions.find((s: { current: boolean }) => s.current).id;
    expect((await laptop.delete(session.DELETE, `/api/me/sessions/${phoneId}`, { params: { id: phoneId } })).status).toBe(200);
    expect((await phone.get(me.GET, "/api/me")).status).toBe(401);
    expect((await laptop.get(me.GET, "/api/me")).status).toBe(200);

    // Someone else's session id is not yours to end.
    expect(other).toBeTruthy();
    const foreign = await w.alice.client.delete(session.DELETE, `/api/me/sessions/${other.id}`, { params: { id: other.id } });
    expect(foreign.status).toBe(404);

    const everywhere = await laptop.delete(sessions.DELETE, "/api/me/sessions");
    expect(everywhere.status).toBe(200);
    expect((await laptop.get(me.GET, "/api/me")).status).toBe(200);
  });

  it("signing out ends the session on the server, not just the cookie", async () => {
    const { client } = await signIn("carol@example.com", "a perfectly long passphrase");
    const cookie = client.cookies.get("snack_session")!;
    expect((await client.post(logout.POST, "/api/auth/logout")).status).toBe(200);
    expect(client.cookies.has("snack_session")).toBe(false);

    const replay = new Client();
    replay.cookies.set("snack_session", cookie);
    expect((await replay.get(me.GET, "/api/me")).status).toBe(401);
  });
});

describe("changing a password", () => {
  it("needs the current one, and signs out every other device", async () => {
    const token = await invite(w.admin.client, "hana@example.com");
    const hana = await signUp("hana@example.com", "the first long passphrase", token);
    const other = (await signIn("hana@example.com", "the first long passphrase")).client;

    const wrong = await hana.client.post(password.POST, "/api/me/password", {
      body: { currentPassword: "not the current one", newPassword: "the second long passphrase" },
    });
    expect(wrong.status).toBe(403);

    const changed = await hana.client.post(password.POST, "/api/me/password", {
      body: { currentPassword: "the first long passphrase", newPassword: "the second long passphrase" },
    });
    expect(changed.status).toBe(200);
    expect(changed.body.otherSessionsEnded).toBe(1);
    expect((await other.get(me.GET, "/api/me")).status).toBe(401);
    expect((await hana.client.get(me.GET, "/api/me")).status).toBe(200);

    expect((await signIn("hana@example.com", "the first long passphrase")).result.status).toBe(401);
    expect((await signIn("hana@example.com", "the second long passphrase")).result.status).toBe(200);
  });
});

describe("administering accounts", () => {
  it("disabling someone signs them out and keeps them out", async () => {
    const token = await invite(w.admin.client, "ivan@example.com");
    const ivan = await signUp("ivan@example.com", "a perfectly long passphrase", token);

    const off = await w.admin.client.patch(adminUser.PATCH, `/api/admin/users/${ivan.id}`, {
      params: { id: ivan.id },
      body: { disabled: true },
    });
    expect(off.status).toBe(200);
    expect((await ivan.client.get(me.GET, "/api/me")).status).toBe(401);
    expect((await signIn("ivan@example.com", "a perfectly long passphrase")).result.status).toBe(401);

    await w.admin.client.patch(adminUser.PATCH, `/api/admin/users/${ivan.id}`, { params: { id: ivan.id }, body: { disabled: false } });
    expect((await signIn("ivan@example.com", "a perfectly long passphrase")).result.status).toBe(200);
  });

  it("never leaves the instance without an administrator", async () => {
    const self = await w.admin.client.patch(adminUser.PATCH, `/api/admin/users/${w.admin.id}`, {
      params: { id: w.admin.id },
      body: { disabled: true },
    });
    expect(self.status).toBe(409);
    const remove = await w.admin.client.delete(adminUser.DELETE, `/api/admin/users/${w.admin.id}`, { params: { id: w.admin.id } });
    expect(remove.status).toBe(409);
  });

  it("a reset link sets a new password once, and ends the old sessions", async () => {
    const token = await invite(w.admin.client, "jo@example.com");
    const jo = await signUp("jo@example.com", "a forgotten long passphrase", token);

    const link = await w.admin.client.post(adminReset.POST, `/api/admin/users/${jo.id}/reset`, { params: { id: jo.id } });
    expect(link.status).toBe(200);
    const resetToken = link.body.url.split("/reset/")[1];

    const used = await new Client().post(reset.POST, "/api/auth/reset", {
      body: { token: resetToken, password: "a remembered long passphrase" },
    });
    expect(used.status).toBe(200);
    expect((await jo.client.get(me.GET, "/api/me")).status).toBe(401);
    expect((await signIn("jo@example.com", "a remembered long passphrase")).result.status).toBe(200);

    const again = await new Client().post(reset.POST, "/api/auth/reset", {
      body: { token: resetToken, password: "yet another long passphrase" },
    });
    expect(again.status).toBe(410);
  });

  it("all of it is in the audit log", async () => {
    const log = await w.admin.client.get(adminAudit.GET, "/api/admin/audit?limit=200");
    const actions = new Set(log.body.events.map((e: { action: string }) => e.action));
    for (const action of [
      "auth.setup",
      "auth.signup",
      "auth.login",
      "auth.login_failed",
      "auth.login_throttled",
      "auth.password_changed",
      "auth.password_reset",
      "admin.invite_created",
      "admin.user_updated",
      "admin.reset_link_created",
      "admin.settings_updated",
    ]) {
      expect(actions, action).toContain(action);
    }
    // Credentials never reach it.
    expect(JSON.stringify(log.body)).not.toMatch(/passphrase/);
  });
});
