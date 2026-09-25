/**
 * The operator's way back in, for when the web console cannot help: the only
 * admin forgot their password, or disabled the wrong account.
 *
 * Runs against the database directly, so whoever can run it already owns the
 * instance — in Docker that means shell access to the container:
 *
 *   docker exec -it snackexercise-tracker node dist/admin.mjs list
 *   docker exec -it snackexercise-tracker node dist/admin.mjs reset-link you@example.com
 *   docker exec -it snackexercise-tracker node dist/admin.mjs make-admin you@example.com
 *   docker exec -it snackexercise-tracker node dist/admin.mjs enable you@example.com
 *   docker exec snackexercise-tracker node dist/admin.mjs backup /data/backup.db
 *
 * Every change is written to the audit log like one made in the console.
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { audit } from "../lib/audit";
import { config } from "../lib/config";
import { disconnectDatabase, prisma } from "../lib/db";
import { LINK_TTL_HOURS, issueLink } from "../lib/auth/links";

const USAGE = `Usage: node dist/admin.mjs <command> [email]

  list                 Every account: role, whether it can sign in, last sign-in.
  reset-link <email>   A one-time link to choose a new password (valid ${LINK_TTL_HOURS.reset} hours).
  make-admin <email>   Give an account administrator rights.
  enable <email>       Let a disabled account sign in again.
  backup <file>        A consistent copy of the whole database, taken while it runs.`;

async function findUser(email: string | undefined) {
  if (!email) throw new Error(`An email is needed.\n\n${USAGE}`);
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) throw new Error(`No account with the email ${email}.`);
  return user;
}

function linkBase(): string {
  // The CLI has no request to read a host from; APP_URL is what it can know.
  return config.appUrl ? config.appUrl.origin : "http://<your-host>:3000";
}

async function main(argv: string[]): Promise<void> {
  // This is a person at a terminal: print answers, not the server's JSON log
  // lines. Errors still come through; the audit rows are written regardless.
  process.env.LOG_LEVEL ??= "warn";
  const [command, email] = argv;
  switch (command) {
    case "list": {
      const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
      if (users.length === 0) {
        console.log("No accounts yet. Open the app to create the first admin.");
        return;
      }
      for (const user of users) {
        const state = user.disabledAt ? "disabled" : user.passwordHash ? "active" : "unclaimed";
        const last = user.lastLoginAt ? user.lastLoginAt.toISOString().slice(0, 16).replace("T", " ") : "never";
        console.log(`${user.email.padEnd(36)} ${user.role.padEnd(7)} ${state.padEnd(10)} last sign-in ${last}`);
      }
      return;
    }
    case "reset-link": {
      const user = await findUser(email);
      if (user.disabledAt) throw new Error(`${user.email} is disabled. Run "enable ${user.email}" first.`);
      const { token } = await issueLink({ purpose: "reset", userId: user.id });
      await audit("admin.reset_link_created", { targetId: user.id, detail: { via: "cli" } });
      console.log(`${linkBase()}/reset/${token}`);
      console.log(`Works once, for ${LINK_TTL_HOURS.reset} hours. Anyone holding it can set ${user.email}'s password.`);
      return;
    }
    case "make-admin": {
      const user = await findUser(email);
      await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
      await audit("admin.user_updated", { targetId: user.id, detail: { role: "admin", via: "cli" } });
      console.log(`${user.email} is an admin.`);
      return;
    }
    case "enable": {
      const user = await findUser(email);
      await prisma.user.update({ where: { id: user.id }, data: { disabledAt: null } });
      await audit("admin.user_updated", { targetId: user.id, detail: { disabled: false, via: "cli" } });
      console.log(`${user.email} can sign in again.`);
      return;
    }
    case "backup": {
      // `email` is the target path here.
      if (!email) throw new Error(`Where to? backup /data/backup-$(date +%F).db\n\n${USAGE}`);
      const target = path.resolve(email);
      if (existsSync(target)) throw new Error(`${target} already exists; pick a new name.`);
      // VACUUM INTO writes a transactionally consistent, compacted copy while
      // the app keeps serving: no stopping the container, no torn WAL.
      await prisma.$executeRaw`VACUUM INTO ${target}`;
      console.log(`Backed up to ${target}. Restore by stopping the app and putting it in place of the database file.`);
      return;
    }
    default:
      console.log(USAGE);
      if (command && command !== "help" && command !== "--help") process.exitCode = 2;
  }
}

main(process.argv.slice(2))
  .catch((error: Error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
