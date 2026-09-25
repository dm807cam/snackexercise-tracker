# 23. Accounts own their data, and every query is scoped by its owner

**Status:** Accepted · 2026-09-25

## Context

Until now the app assumed one person: no accounts, every row global, the README
telling you to keep it off the internet because anyone who could reach it could
read and change everything. That is fine for one person on a home network and
wrong for the people this app is for — someone who trains in hotel rooms and
offices needs to reach it from outside the house, and a household, a team or a
small company wants one instance for several people.

Two ways to add people were on the table:

- **One database per person**, chosen by a router in front. Isolation for free,
  and nothing else for free: migrations, backups and the shared exercise
  catalogue multiply by the number of people, and the scheduler has to walk
  every file.
- **One database, a `userId` on every row it concerns.** Isolation becomes a
  property of the code, so it has to be designed in rather than hoped for.

## Decision

**One database, and every row a person creates belongs to exactly one `User`.**
`SetEntry`, `DailyMetric`, `Setting`, `TrainingContext`, `Snack`,
`ExercisePreference`, `PushSubscription`, `Nudge`, `BusyBlock`, `ApiToken`,
`Session` — each carries `userId`, is indexed by it, and cascades when the
account is deleted.

**The exercise catalogue is the one shared thing.** `Exercise.ownerId` is null
for the catalogue every account sees, which only an admin may change, and a
user id for a movement somebody added themselves, which nobody else sees.
Partial unique indexes keep the catalogue free of duplicate names without
stopping two people each adding a "Jefferson curl" of their own; a person's own
movement with a catalogue name shadows the catalogue one for them.

**There is no ambient "current user".** Every function in `lib/queries.ts` takes
the user id as its first argument, and every route gets it from
`authenticate()` (`lib/auth/guard.ts`) before touching data. A query cannot
forget to filter, because it cannot be called without saying for whom.

**Someone else's row is a missing row.** Updating, deleting or reading an id
that exists but belongs to another account returns exactly the 404 a
nonexistent id does, so ids cannot be probed.

**Administrators run the instance; they do not read logs.** The console shows
accounts with counts and dates, never entries. There is no admin route that
returns another person's training.

**Upgrading keeps the existing log.** The migration creates a `legacy-owner`
account holding every existing row — only if there is any — with no password.
`/setup` claims it: the first admin inherits the history that predates accounts.

## Why

**Scoping as a function signature, not a convention.** "Remember to add
`where: { userId }`" fails the first time somebody forgets. A required first
argument fails at compile time.

**Indistinguishable 404s** are the standard answer to insecure direct object
references, and they cost nothing.

**Admins without read access** is the difference between a household trusting
the person who set up the box and not. It also means an admin account is not a
more valuable target than any other.

## Consequences

- The integration tests (`tests/integration/isolation.test.ts`) exercise every
  data route as a second account against the first account's ids, including
  snacks, places, custom movements, settings, steps, busy times and the export.
- A per-account export (`/api/export`, version 5) carries the account's own
  rows and the movements it can see; importing restores into the importing
  account.
- Anything added later that stores personal data needs a `userId` and a scoped
  query; the pattern is the only one in the codebase.
