# Snack Exercise Tracker

A workout log for people who don't do workouts.

If you train by wandering into the basement a few times a day and picking
something heavy up, ordinary fitness apps get in the way: they assume a session
with a plan, a start and an end, and they make you type. This one assumes the
opposite. You log a snack in a sentence, and it answers the question that
actually matters when training is unstructured — **am I hitting everything, or
have I quietly not trained hamstrings in three weeks?**

Self-hosted, single container, SQLite on a volume. No account, no cloud.

## What it does

**Today** — front and back body diagrams shaded by what you've trained, above a
chronological list of the day's entries. Chevrons top-left or a horizontal
swipe move between days. Tap a muscle to filter the list to it.

**Calendar** — a month at a glance, each day shaded by how much work it carried,
plus active days, current streak and longest gap. Tap any day to open it.

**Stats** — a 12-axis radar of muscle coverage over the last 7 / 30 / 60 / 90 /
180 days, with the previous equal period overlaid. Underneath, a list ordered by
days since last trained. That list is the point of the app.

**Logging** — say it or type it. "Three sets of twelve kettlebell swings at 24
kilos and a two minute plank" becomes two entries. Nothing is written until you
confirm, and anything can be deleted (with undo).

### Effective sets, not tonnage

The primary measure is **effective sets**: each set credits the muscles it
trains, weighted 1.0 primary / 0.5 secondary / 0.25 stabiliser. It's the
standard way of counting hypertrophy volume, and it still works when you didn't
record a weight — which, logging one-handed on the way back upstairs, is most of
the time. Tonnage is shown alongside wherever weights exist, never guessed.

Radar values are normalised to **effective sets per week**, so a 7-day window
and a 180-day window are directly comparable rather than the longer one always
looking like a triumph.

## Running it

```bash
git clone https://github.com/dm807cam/snackexercise-tracker.git
cd snackexercise-tracker
cp .env.example .env        # optional; set TZ and an OpenRouter key
docker compose up -d --build
```

Then open `http://<your-host>:3000`. On a phone, use "Add to Home Screen" — it
installs as a standalone app.

If port 3000 is already taken on the host, set `APP_PORT` (in `.env`, or as a
stack variable when deploying through Portainer) — the container always listens
on 3000 internally, only the published port changes.

Set `TZ` to your own zone in `docker-compose.yml`: it decides where one day ends
and the next begins, so a 23:30 snack lands on the right evening. You can also
override it later in Settings without redeploying.

The container applies migrations and seeds the exercise catalogue on every
start. Both steps are idempotent, so restarting is always safe.

### Voice entry

Optional, and the app is fully usable without it. Put an
[OpenRouter](https://openrouter.ai) key in Settings (or set `OPENROUTER_API_KEY`
before the first run) and the "Say it" tab appears. Dictate with your phone
keyboard's microphone; the text goes to OpenRouter, which returns structured
entries constrained by a strict JSON schema.

**Nothing is saved until you confirm it.** The parsed entries are shown in an
editable review sheet first — a misheard "225" silently entering your history is
worse than no entry at all. Movements the catalogue doesn't know come back
flagged, with a suggested muscle mapping you can accept or change.

The key is stored server-side and never sent to the browser or included in
exports.

### Backups

Everything lives in one SQLite file on the `snackexercise-data` volume.

```bash
# copy the database out
docker compose cp app:/data/app.db ./backup-$(date +%F).db
```

Settings → *Export everything* also produces a JSON file containing your entries
**and** the exercise catalogue with its muscle weightings — entries alone
couldn't reproduce the body map or radar. Importing adds to what's there and
skips entries it recognises, so re-importing the same file won't double your
history.

## Development

```bash
npm install
cp .env.example .env
npx prisma migrate deploy && npm run db:seed
npm run dev
```

| Command | |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm test` | unit tests (Vitest) |
| `npm run test:e2e` | browser smoke tests (Playwright) |
| `npm run typecheck` | TypeScript |

Unit tests are pinned to `Europe/Berlin`, because the DST cases they cover would
prove nothing under UTC.

If your environment has a preinstalled browser that doesn't match the Playwright
version, point at it:

```bash
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium npm run test:e2e
```

### Layout

```
app/                 pages and API routes
components/
  BodyMap/           front/back diagrams and their geometry
  DayView/           day page: header, swipe, entry list
  QuickAdd/          the "Say it" / "Manual" sheet
  Stats/             radar chart
lib/
  muscles.ts         muscle taxonomy — the single source of truth
  scoring.ts         effective-set aggregation (pure, unit tested)
  dates.ts           local-day arithmetic and formatting
  openrouter.ts      LLM client and response schema
prisma/              schema, migrations, exercise catalogue seed
```

Three decisions worth knowing before changing things:

- **`SetEntry` has no parent workout or session.** The absence is the design.
- **`localDate` is stored, not derived at query time.** Day boundaries follow
  your configured zone, and a denormalised `YYYY-MM-DD` keeps every day,
  calendar and window query an index scan with no timezone arithmetic.
- **Date labels are built from fixed tables, not `Intl` patterns.** Node and the
  browser ship different ICU data — the same date renders as `Sun 6 Sept` in one
  and `Sun, 6 Sept` in the other, which silently breaks React hydration.

## Attribution

The body diagram geometry is adapted from
[react-body-highlighter](https://github.com/GV79/react-body-highlighter)
(MIT, © 2020 GV79). See [NOTICE](./NOTICE).
