/**
 * The instance most tests start from, built the way people build it: the
 * first visitor sets it up and becomes admin, then invites two members, who
 * sign up with their links. Only real routes; nothing written behind their
 * backs except the shared catalogue, which the container's seed provides.
 */

import { Client, PASSWORDS } from "./harness";
import { seedCatalogue } from "@/prisma/seed";
import * as setupRoute from "@/app/api/auth/setup/route";
import * as signupRoute from "@/app/api/auth/signup/route";
import * as invitesRoute from "@/app/api/admin/invites/route";
import * as meRoute from "@/app/api/me/route";

export interface Member {
  client: Client;
  id: string;
  email: string;
}

export interface World {
  admin: Member;
  alice: Member;
  bob: Member;
}

export async function invite(admin: Client, email?: string, role: "member" | "admin" = "member"): Promise<string> {
  const { status, body } = await admin.post(invitesRoute.POST, "/api/admin/invites", {
    body: { role, ...(email ? { email } : {}) },
  });
  if (status !== 200) throw new Error(`invite failed: ${status} ${JSON.stringify(body)}`);
  return body.url.split("/invite/")[1];
}

export async function signUp(email: string, password: string, token: string): Promise<Member> {
  const client = new Client();
  const { status, body } = await client.post(signupRoute.POST, "/api/auth/signup", {
    body: { email, password, invite: token },
  });
  if (status !== 200) throw new Error(`signup failed: ${status} ${JSON.stringify(body)}`);
  return { client, id: body.user.id, email };
}

let built: Promise<World> | null = null;

/** Built once per test file; tests that need a pristine instance make their own. */
export function world(): Promise<World> {
  built ??= (async () => {
    await seedCatalogue({ quiet: true });

    const adminClient = new Client();
    const setup = await adminClient.post(setupRoute.POST, "/api/auth/setup", {
      body: { email: "admin@example.com", name: "Admin", password: PASSWORDS.admin },
    });
    if (setup.status !== 200) throw new Error(`setup failed: ${setup.status} ${JSON.stringify(setup.body)}`);
    const me = await adminClient.get(meRoute.GET, "/api/me");

    const alice = await signUp("alice@example.com", PASSWORDS.alice, await invite(adminClient, "alice@example.com"));
    const bob = await signUp("bob@example.com", PASSWORDS.bob, await invite(adminClient, "bob@example.com"));
    return { admin: { client: adminClient, id: me.body.user.id, email: "admin@example.com" }, alice, bob };
  })();
  return built;
}
