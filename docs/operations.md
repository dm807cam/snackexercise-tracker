# Running an instance

For whoever looks after a Snack Exercise Tracker instance: deployment, first
boot, HTTPS, health, backups, upgrades, recovery. Every environment variable is
listed with what it does in [`.env.example`](../.env.example); none is required.

## First boot

The container migrates the database and seeds the exercise catalogue on every
start (both idempotent), then serves on port 3000. A fresh instance has no
accounts, and sends its first visitor to `/setup` to create the admin. Pick one
of these so that visitor is you:

- **`SETUP_TOKEN`** — `/setup` asks for it.
- **`ADMIN_EMAIL` + `ADMIN_PASSWORD`** (and optionally `ADMIN_NAME`) — the admin
  is created at start-up, before anyone can reach the page. Remove the password
  from the environment afterwards; it is only read on a first boot.
- Nothing, on a network where you are the only one who can reach it yet.

An instance upgraded from before accounts existed keeps its log: `/setup` then
claims it, and the first admin inherits every entry.

After that, people join by **invitation** (Administration → Invitations): a
link, optionally for one email address, that works once within seven days. The
app sends no email; pass the link on however you like. `REGISTRATION` (or the
console) can instead allow anyone to sign up, or nobody.

## HTTPS and reverse proxies

Anything reachable from outside your own network belongs behind HTTPS, and
nudges need it regardless: browsers only allow push notifications and service
workers on secure origins (localhost excepted). A minimal Caddy setup:

```
snacks.example.com {
    reverse_proxy snackexercise-tracker:3000
}
```

Then tell the app where it lives and how many proxies are in front:

```
APP_URL=https://snacks.example.com
TRUST_PROXY=1
```

`APP_URL` is used for invitation and reset links and as an accepted origin;
`TRUST_PROXY` decides which `X-Forwarded-For` entry is the client, which the
sign-in throttling keys on. With `APP_URL` on https the session cookie is always
`Secure`, and HSTS is sent.

On iPhone and iPad, notifications need the app added to the Home Screen
(Share → Add to Home Screen) on iOS 16.4 or later; Settings → Nudges says so on
a device where that is the problem.

## Health, readiness, metrics, logs

| Endpoint | Answers | Use it for |
| --- | --- | --- |
| `GET /api/health` | the process is up and can query its database | liveness |
| `GET /api/ready` | migrated to this build's newest migration, none failed half-way, catalogue seeded | readiness; the compose healthcheck uses this |
| `GET /api/internal/metrics` | Prometheus text: sign-ins by outcome, snacks planned and finished, nudges, push deliveries, scheduler ticks, unhandled errors, and account/session/device/token counts | scraping, with `Authorization: Bearer $METRICS_TOKEN`; absent unless that is set |

Logs are one JSON object per line — `docker logs` shows them — at `LOG_LEVEL`
(`info` by default). Every request carries an `x-request-id`, echoed in the
response, and audit events are logged as well as stored. Worth alerting on:
`level: "error"`, `snack_api_unhandled_errors_total` rising, and
`snack_scheduler_ticks_total{result="error"}`.

## Backups

Everything is in one SQLite file, `/data/app.db`. Take a consistent copy while
the app runs:

```bash
docker exec snackexercise-tracker node dist/admin.mjs backup /data/backup-$(date +%F).db
docker cp snackexercise-tracker:/data/backup-$(date +%F).db .
```

`backup` uses SQLite's `VACUUM INTO`: a transactionally consistent, compacted
copy with no need to stop anything. Copying `app.db` itself while the app runs
can miss what is still in the write-ahead log.

**To restore**, stop the container, put the backup in place of `/data/app.db`
(delete any `app.db-wal` and `app.db-shm` beside it), and start it again.

Each person can also export their own data as JSON (Settings → Your data), and
import it into an account on any instance.

Backups contain everyone's logs. Store them accordingly.

## Upgrades

```bash
git pull
docker compose up -d --build
```

Migrations run at start-up and only ever move forward. **Take a backup first**:
the way back from a bad upgrade is the previous image plus the backup, not a
down-migration. If a migration fails, the container stops before the server
starts, and the log names the migration.

## Recovery: the operator CLI

`dist/admin.mjs` runs inside the container against the database directly, so it
needs shell access to the host — which is the point: it is the way back in when
the web console cannot help.

```bash
docker exec -it snackexercise-tracker node dist/admin.mjs list
docker exec -it snackexercise-tracker node dist/admin.mjs reset-link you@example.com   # forgot the only admin password
docker exec -it snackexercise-tracker node dist/admin.mjs make-admin someone@example.com
docker exec -it snackexercise-tracker node dist/admin.mjs enable someone@example.com  # disabled the wrong account
docker exec snackexercise-tracker node dist/admin.mjs backup /data/backup.db
```

Its changes are written to the audit log like the console's. A reset link from
the CLI uses `APP_URL` for its host when that is set; otherwise substitute your
own.

## Background jobs

Each server process runs a scheduler (`SCHEDULER`, on by default in
production): nudges once a minute, housekeeping once an hour. Housekeeping
removes expired sessions, rate-limit windows and spent or expired links, audit
events older than `AUDIT_RETENTION_DAYS` (365), and nudge records older than 120
days, and marks snacks never finished from before yesterday as expired.

Each job takes a lease in the database first, and every nudge is claimed by a
unique key before it is sent, so several processes never duplicate work. On
`SIGTERM` the server stops taking requests, finishes the ones in flight and
releases its leases.

## Scaling, and its limits

SQLite serves one writer at a time, which is ample for a household, a team or
a small company: a snack is a handful of rows. The limits to know:

- Several replicas can share a database only on **one host** (WAL needs shared
  memory beside the file). The jobs are safe across replicas; sessions and
  rate limits are in the database, so any replica can serve any request.
- On a **network filesystem** (NFS, SMB), set `SQLITE_JOURNAL_MODE=DELETE`:
  WAL's shared memory does not work there.
- Web Push keys are generated once and kept in the database. To manage them
  yourself, set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (and `VAPID_SUBJECT`)
  — but changing them orphans every existing subscription, and everyone has to
  turn nudges on again.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| Start-up fails with a read-only database | A bind-mounted directory owned by root: `sudo chown 1000:1000 /srv/snackexercise` |
| The container restarts right after "Applying database migrations" | A migration failed; the log names it. Start the previous image on the backup taken before the upgrade |
| `/api/ready` returns 503 with `migrations: false` | The database is behind this build, or records a failed migration — usually a database file swapped in by hand while the app ran. Restart the container so its migration step runs |
| `/api/ready` returns 503 with `catalogue: false` | The seed did not run; check the start-up logs for the seed step |
| "Turn on nudges" does nothing on iPhone | The app is open in Safari rather than from the Home Screen |
| Nudges arrive late or not at all | Is `SCHEDULER` off on every replica? Is the device's notification permission still granted? Settings → Nudges → Send a test |
| Everyone's sign-ins are throttled together | `TRUST_PROXY` does not match the proxies in front, so every request looks like it comes from the proxy |
| Invitation links point at the wrong host | Set `APP_URL` |
