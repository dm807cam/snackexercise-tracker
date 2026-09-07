# Snack Exercise Tracker

[![CI](https://github.com/dm807cam/snackexercise-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/dm807cam/snackexercise-tracker/actions/workflows/ci.yml)

A workout log for people who don't do workouts.

If you train by wandering into the basement a few times a day and picking
something heavy up, ordinary fitness apps get in the way: they assume a session
with a plan, a start and an end, and they make you type. This one assumes the
opposite. You log a snack in a sentence, and it answers the question that
actually matters when training is unstructured — **am I hitting everything, or
have I quietly not trained hamstrings in three weeks?**

Self-hosted, single container, SQLite on a volume. No account, no cloud.

## What it does

**Today** — a bar at the top proposing what to train next and why, then front
and back body diagrams shaded by what you've trained, a timeline of how the
day's snacks were spread, and a chronological list of the day's entries.
Chevrons top-left or a horizontal swipe move between days. Tap a muscle to
filter the list to it; tap the suggestion to log it with the movement already
chosen.

**Calendar** — a month at a glance, each day shaded by how much work it carried,
plus active days, current streak and longest gap. Tap any day to open it.

**Stats** — a strength/cardio balance marker over the window, then a 12-axis
radar of muscle coverage over the last 7 / 30 / 60 / 90 / 180 days carrying two
lines: strength in blue, cardio in orange, with the previous equal period
overlaid. Underneath, a list ordered by days since last trained, and a spacing
score with a by-the-hour histogram of when your training actually lands. That
list is the point of the app.

**Logging** — say it or type it. "Three sets of twelve kettlebell swings at 24
kilos and a two minute plank" becomes two entries. Every entry carries a time
you can set or correct, so a run done at 06:30 and remembered at 21:00 is a
morning run. Nothing is written until you confirm, and anything can be deleted
(with undo).

### Effective sets, not tonnage

The primary measure is **effective sets**: each set credits the muscles it
trains, weighted 1.0 primary / 0.5 secondary / 0.25 stabiliser. It's the
standard way of counting hypertrophy volume, and it still works when you didn't
record a weight — which, logging one-handed on the way back upstairs, is most of
the time. Tonnage is shown alongside wherever weights exist, never guessed.

Radar values are normalised to **effective sets per week**, so a 7-day window
and a 180-day window are directly comparable rather than the longer one always
looking like a triumph.

### Cardio, steps, and the balance marker

Cardio is logged like anything else — "ran 5k in 27 minutes" is one entry — but
it is **not** scored in effective sets. A 40-minute run logged as one set would
have the radar claim it delivered leg volume; logged as forty it would silence
"needs attention" for legs for a fortnight. So each movement carries a
`cardioBias` from 0 to 1, and effective sets are scaled by `1 - cardioBias`:
pure cardio contributes nothing to the radar or the body map, and genuinely
mixed movements — burpees, kettlebell swings, sled pushes — split in proportion.

Cardio gets its own currency, **MET-minutes** (intensity x duration), taken from
your heart rate if you logged one, otherwise from your pace, otherwise from the
movement's typical cost. Steps count too, above a baseline and at half weight by
default, with the steps from a logged run subtracted so your phone doesn't count
the same run twice.

The marker itself measures each side against **its own weekly guideline** — 60
effective sets, 600 MET-minutes — and shows cardio's share of the total. That
normalisation is the point: the middle means *on target for both*, not that two
incompatible units happened to tie. It is drawn as a band rather than a needle,
because the width is real, and it disappears entirely when there is too little
logged to say anything honest.

Under Settings you can turn step-counting off, or up to full weight, and set the
baseline by hand instead of letting the app take the quiet quarter of your own
days.

Cardio stays out of the effective-set total, but not out of sight. It travels as
a second channel in the same per-muscle shape — an outline on the body map, its
own orange line on the radar — so a 10 km run shows up on the calves it actually
loaded. The two are drawn separately and never added: the radar puts them on one
radial scale using the same exchange rate the calendar already uses (600
MET-minutes and 60 effective sets are each one guideline-week, so 10 MET-minutes
reach as far as one effective set).

### Spreading it out

Volume is only half the claim this app makes. The other half is that the same
work spread across the day beats the same work in one block, and until recently
nothing here measured it.

The **spacing score** does. Entries within a quarter of an hour of each other
count as one bout; the bouts cut your waking window into gaps, and the score
compares how concentrated those gaps are against a day broken up roughly every
couple of hours. Five evenly spread bouts score 100%; one evening block scores
under 30%, and so does a single well-placed session — frequency counts, not just
evenness. A day with nothing logged scores nothing at all rather than zero,
because a rest day is not a badly spread day.

The day page shows today's bouts on a timeline; the stats page shows the average
over the window with a histogram of which hours your training actually lands in.
Set your waking hours under Settings — scoring a night-shift worker's 22:00
session as badly timed would just make the number something to ignore.

### What to do next

The day page opens with one line: the muscle group that has waited longest, a
movement from the catalogue that trains it, and the reason. It ranks the twelve
axes on staleness (days since last trained, dominant) and volume deficit
(against your best-served axis, as the tie-break), with cardio competing as a
thirteenth pseudo-axis against its own guideline — so a fortnight of lifting and
no running produces "go for a run" rather than a thirteenth way to say "back".
If it has been a while since your last snack, the bar says that too.

It is a nudge, not a prescription: it has no idea what equipment is to hand or
what hurts today, which is why it shows its reasoning, offers two alternatives,
and gates nothing.

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

### Steps from your phone

The realistic way to get steps in is an automation. On iOS, a Shortcut:

1. **Get Health Sample** — Steps, *Today*, Sum
2. **Get Contents of URL** — `http://<your-host>:3000/api/metrics/` + today's
   date as `yyyy-MM-dd`, method `PUT`, request body JSON
   `{"steps": <the number>, "source": "shortcut"}`

Add it to a personal automation at 23:50 daily. The endpoint upserts, so
re-running it corrects the day rather than adding to it. On Android the same
call works from Tasker or HTTP Shortcuts.

There is no authentication on the app, so this needs nothing but the URL — which
is also why it should stay on your own network.

To backfill history, Settings takes a CSV with a date column and a steps column;
an Apple Health, Google Fit or Fitbit export works as-is, and several rows for
the same day are added together.

### Backups

Everything lives in one SQLite file on the `snackexercise-data` volume.

```bash
# copy the database out
docker compose cp app:/data/app.db ./backup-$(date +%F).db
```

Settings → *Export everything* also produces a JSON file containing your entries
**and** the exercise catalogue with its muscle and cardio weightings, **and**
your daily step counts — entries alone couldn't reproduce the body map, the
radar or the balance marker. Importing adds to what's there and skips entries it
recognises, so re-importing the same file won't double your history. Exports
from before cardio existed (`version: 1`) still restore.

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

### CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request,
in two parallel jobs:

- **Typecheck, unit tests, build, browser tests** — the commands in the table
  above, on Node 22 to match the container.
- **Container builds and serves** — builds the image, starts it, and checks that
  `/api/health` comes up and the catalogue actually seeded. Building is not the
  same as working: the runtime stage assembles the standalone bundle, the Prisma
  CLI and the seed by hand, and a mistake there only shows when the container is
  asked to start.

To reproduce a CI failure locally, run the same sequence from a clean checkout —
`generated/` is gitignored, so `npx prisma generate` comes first or nothing
resolves.

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
  DayView/           day page: header, swipe, entry list, spacing, next-up bar
  QuickAdd/          the "Say it" / "Manual" sheet
  Stats/             radar chart, balance gradient, spacing card
lib/
  muscles.ts         muscle taxonomy — the single source of truth
  scoring.ts         effective-set aggregation (pure, unit tested)
  cardio.ts          MET-minutes, pace equations, step credit (pure)
  balance.ts         the strength/cardio index (pure)
  spacing.ts         how well a day was broken up (pure)
  suggest.ts         what to train next, and why (pure)
  dates.ts           local-day arithmetic and formatting
  openrouter.ts      LLM client and response schema
prisma/              schema, migrations, exercise catalogue seed
```

A few decisions worth knowing before changing things:

- **`SetEntry` has no parent workout or session.** The absence is the design.
- **`localDate` is stored, not derived at query time.** Day boundaries follow
  your configured zone, and a denormalised `YYYY-MM-DD` keeps every day,
  calendar and window query an index scan with no timezone arithmetic.
- **Date labels are built from fixed tables, not `Intl` patterns.** Node and the
  browser ship different ICU data — the same date renders as `Sun 6 Sept` in one
  and `Sun, 6 Sept` in the other, which silently breaks React hydration.
- **Steps are a `DailyMetric`, not a `SetEntry`.** They're a measurement of the
  day, not something you did at a moment, and forcing them into the log would
  inflate entry counts, set counts, active days and the calendar shading.
- **A human-chosen time travels as `performedTime` ("HH:MM") plus `localDate`,
  never as an instant built in the browser.** The browser cannot know the zone
  the app buckets days in — that's a stored setting — so an instant it builds
  lands an hour out for anyone travelling, and on the wrong day near midnight.

The reasoning behind the cardio and steps design is written up in
[docs/cardio-and-steps.md](./docs/cardio-and-steps.md), with the decisions
recorded as ADRs in [docs/adr/](./docs/adr/).

## Attribution

The body diagram geometry is adapted from
[react-body-highlighter](https://github.com/GV79/react-body-highlighter)
(MIT, © 2020 GV79). See [NOTICE](./NOTICE).
