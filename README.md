# Snack Exercise Tracker

[![CI](https://github.com/dm807cam/snackexercise-tracker/actions/workflows/ci.yml/badge.svg)](https://github.com/dm807cam/snackexercise-tracker/actions/workflows/ci.yml)

A workout log, and a coach that taps you on the shoulder, for people who don't
do workouts.

If your training happens in the gaps of the day — three minutes in a hotel room
before a call, a flight of stairs at the station, something heavy in the
basement between meetings — ordinary fitness apps get in the way: they assume a
session with a plan, a start and an end, and they make you type. This one
assumes the opposite. It proposes a snack sized to **the minutes you have and
the place you are in**, walks you through it, says when the next one is due,
and answers the question that actually matters when training is unstructured —
**am I hitting everything, or have I quietly not trained hamstrings in three
weeks?**

Self-hosted, single container, SQLite on a volume. Accounts for everyone in the
household or team, each log private to its owner. No cloud.

## What it does

**Today** — two closing rings showing how much strength and cardio today still
owes; the **Snack now** card, with a snack you could do right here in the
minutes you have, one tap from starting, and when the next one is planned; then
front and back body diagrams filled in blue for what you've lifted and outlined
in orange for what you've run, a timeline of how the day's snacks were spread,
and a chronological list of the day's entries. Chevrons top-left or a
horizontal swipe move between days. Tap a muscle to filter the list to it; tap
a movement on the card to log it by hand instead.

**The snack player** — Start opens it full screen: one movement at a time, the
reps or a clock for holds and intervals, rests counted down, cues for form, and
a summary where you correct what you actually did before it is logged. Stop
early and it offers to log what you did.

**Nudges** — switched on per device, a notification when a snack is due, spread
across your waking hours around your busy times, with the snack already planned
for wherever you are. "In 30 min" snoozes it. The same plan is available as a
calendar feed.

**Calendar** — a month at a glance, each day washed blue by the strength it
carried and ringed orange if it carried cardio, plus active days, current
streak and longest gap. Tap any day to open it.

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

**Settings** — your places and what each one has, nudges, targets, tokens for
automations, and your account and signed-in devices. **Administration**, for
admins: invitations, accounts, who may sign up, and the audit log.

### Effective sets, not tonnage

The primary measure is **effective sets**: each set credits the muscles it
trains, weighted 1.0 primary / 0.5 secondary / 0.25 stabiliser. It's the
standard way of counting hypertrophy volume, and it still works when you didn't
record a weight — which, logging one-handed on the way back upstairs, is most of
the time. Tonnage is shown alongside wherever weights exist, never guessed.

The radar carries a **target ring** at 10 hard sets per muscle per week — where
the hypertrophy dose–response is clearly established — and a fainter one at 20,
where it has flattened. Without an absolute reference the chart scaled every
spoke by the largest spoke, so a uniformly under-trained log drew a full, even
polygon and nothing in the app disagreed. The target is configurable in
Settings; see [ADR 0017](./docs/adr/0017-the-radar-is-read-against-an-absolute-target.md).

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

The marker itself measures each side against **its own weekly target** —
about 27 hard sets and 600 MET-minutes by default, both configurable — and shows
cardio's share of the total. That normalisation is the point: the middle means
*on target for both*, not that two incompatible units happened to tie. It is drawn as a band rather than a needle,
because the width is real, and it disappears entirely when there is too little
logged to say anything honest.

Under Settings you can turn step-counting off, or up to full weight, and set the
baseline by hand instead of letting the app take the quiet quarter of your own
days — which also names the thing that setting actually decides: how many steps
fill half a day's cardio ring.

**Walking never closes the cardio ring on its own.** It fills at most half of it,
because the ring asks "is there anything left in me that I owe today?" and
answering "no" because you walked to the shops is exactly what the step discount
exists to avoid. The balance marker still counts every credited step — its
question is different. Above-baseline steps are credited as *incidental* walking;
if your phone also reports brisk or active minutes, those are credited at the
brisk rate instead. See [ADR 0021](./docs/adr/0021-walking-cannot-close-the-cardio-ring.md).

Cardio stays out of the effective-set total, but not out of sight. It travels as
a second channel in the same per-muscle shape — an outline on the body map, its
own orange line on the radar — so a 10 km run shows up on the calves it actually
loaded. The two are drawn separately and never added: the radar puts them on one
radial scale using the same exchange rate the calendar uses — a week of each
side's target is the same distance, so at the default about 10 MET-minutes reach
as far as one effective set. Raise the cardio target and that rate moves with
it, which is the honest answer to "how much of my target was that run".

### How hard, not just how much

MET-minutes are intensity times duration collapsed into one product, so 150
minutes of strolling and 37 minutes of hard running are the same number. They
are not the same thing: at *matched* volume a higher vigorous proportion is
associated with lower mortality, and 1–2 minute vigorous bouts — this app's own
format — carry benefit of their own.

Enter a **year of birth** in Settings and heart rates are read against your own
predicted maximum (Tanaka) rather than a fixed 150 bpm, which is ~79% of a
25-year-old's maximum and ~90% of a 60-year-old's. Add a **resting heart rate**
and it uses heart-rate reserve instead. Leave both blank and nothing already
logged changes. Entries are then classified light / moderate / vigorous on the
ACSM bands, and vigorous minutes and bouts are reported beside the total — never
added to it. See [ADR 0020](./docs/adr/0020-intensity-is-classified-on-the-users-own-scale.md).

### One colour, one quality

**Blue is strength. Orange is cardio. Teal is timing.** Everywhere — the body
map, the radar, the calendar, the balance bar, the per-axis bars, the "needs
attention" dots. Learn the two colours once and every chart in the app reads the
same way.

`--accent` is the app's *interaction* colour — buttons, the log button, the
active nav tab, a selected chip — and never encodes a quantity. It happens to be
the same orange as cardio, on purpose, so the cardio end of the balance gradient
stays continuous with the app's identity; the rule that nothing data-shaped
wears it is what keeps that from being a lie. [ADR
0013](./docs/adr/0013-one-colour-one-quality.md).

Nothing is carried by colour alone: every one of those marks is named in a
legend, a key or an `aria-label`.

### Spreading it out

Volume is only half the claim this app makes. The other half is that the same
work spread across the day beats the same work in one block, and until recently
nothing here measured it.

The **spacing score** does. Anything logged within a few minutes of a snack
starting joins it, so three movements at the top of the stairs are one snack and
not three; the snacks cut your waking window into gaps, and the score compares how
concentrated those gaps are against a day broken up evenly at your target
frequency. Five evenly spread snacks score 100% at the default; one evening
block scores under 30%, and so does a single well-placed session — frequency
counts, not just evenness. A day with nothing logged scores nothing at all
rather than zero, because a rest day is not a badly spread day.

**It measures how your training was distributed, not how much you sat.** Those
are different exposures with different doses, and only the first is one this app
can see. The dose for breaking up sitting is roughly every 20–30 minutes, in 2–5
minute bouts (Dempsey 2016; Buffey 2022; Dunstan 2012) — fifteen to twenty-five
interruptions a day, most of them standing up to make tea, none of which will
ever be logged here. The default of five comes from the exercise-snacks work
this app's format actually descends from: ~3 vigorous bouts a day in Jenkins
2019 and Islam 2022, 3–4 in Stamatakis 2022's VILPA analysis.

Both numbers are yours. Set your waking hours under Settings — scoring a
night-shift worker's 22:00 session as badly timed would just make the number
something to ignore — and set the snacks-a-day target if five is not what you
are aiming at. The window for merging entries into one snack moves with the
target, so a stricter aim stays reachable instead of being swallowed by the
merge.

The day page shows today's snacks on a timeline; the stats page shows the
average over the window, a histogram of which hours your training actually lands
in, your longest quiet stretch, and how much movement a typical snack recorded.
That last one counts only the durations your entries actually carry — a run or a
plank has one, a set of ten push-ups does not — and it is reported and **not**
scored: Buffey found two minutes of walking effective where one was not, but
that threshold is about walking breaks for glucose, and refusing to count a
20-second stair sprint would contradict the whole premise. You get to see the
number and decide.

### Getting stronger?

Everything else on the stats page is a *coverage* measure. This one is not: per
movement, the **best single set** of each day over the last six months —
estimated 1RM where there is load, best-set reps where the load is fixed,
longest hold for a plank — and how long the best has stood.

A movement trained six or more times over four or more weeks without its best
moving is marked **stalled**, appears in "needs attention", and, where the
catalogue has a harder variation, the snack planner proposes the next rung
instead (push-up → diamond push-up → dip) and says why. A fixed-load movement
cannot progress by adding weight, so the next variation *is* the progression.
See [ADR 0018](./docs/adr/0018-progression-is-a-per-movement-best-set.md).

### How much is left today

The day opens with two rings: outer for strength, inner for cardio, each closing
as the day fills them. Beside them, what is still owed — "2.4 sets to go",
"86 MET-min to go · about 14 min".

Each target is **a seventh of that side's weekly guideline**, so ~3.9 hard sets
and ~86 MET-minutes a day, derived from the same constants the balance marker
and the calendar use. Steps count toward cardio on the same terms the balance
marker uses.

Both weekly targets are **configurable** in Settings, defaulting to the
public-health guideline. A "longevity" preset raises cardio to 1,200
MET-minutes — the bottom of the band the large cohort studies put the lowest
all-cause mortality in — and deliberately leaves strength alone, because the
mortality-optimal resistance dose is *lower* than the hypertrophy one. The WHO
minimum stays marked on the cardio ring whatever you aim at, so passing it is
still visible. See [ADR 0019](./docs/adr/0019-targets-are-configurable-and-the-two-claims-are-separate.md).

The strength side counts **hard sets** — one set counts once however many
muscles the movement trains. Effective sets fan out across those muscles, which
is right for the body map and the radar and wrong for a single daily number: it
closed the ring four times faster on deadlifts than on triceps extensions. See
[ADR 0016](./docs/adr/0016-the-scalar-dose-is-hard-sets.md).

**Nothing carries over.** A huge Tuesday does not buy Wednesday off, and an
empty Monday does not make Tuesday owe double — a target that moves for reasons
off-screen is not a target, and banking a surplus invites paying the week off in
one Saturday, which is what the spacing score exists to discourage. The weekly
picture is on the stats page. A rest day shows two open rings and the copy never
scolds; there is no streak to break. [ADR
0014](./docs/adr/0014-a-daily-share-with-no-carry-over.md).

### A snack for right now

The day opens with a snack you could do now: one to four movements, dosed for
you, that fit **where you are** and **the minutes you have**, each with the
reason it was chosen.

Where you are is a *place* — every account starts with Home, Office, Hotel room
and On the move, and you tick once what each one has. The vocabulary is
furniture as much as kit, because a hotel room has a chair, a desk, a wall, a
door and a towel, and each of those opens up movements a bare floor does not:
incline push-ups, chair dips, towel rows. A place also says whether it must stay
**quiet** (someone asleep downstairs), whether the **floor** is an option, and
how much **sweat** is acceptable before your next meeting.

What goes in the snack comes from five signals multiplied together: what the
week is short of (staleness first, weekly deficit second, cardio competing on
the same scale), what the last few hours already covered (fatigue per muscle
decaying over about a day, so push-ups an hour ago mean back now), what today's
rings still ask, what this place allows, and what you actually do when a
movement is proposed — a per-movement record of done, skipped and swapped,
sampled rather than averaged so the planner keeps learning. Doses progress from
your own last set and how hard you said it was. See [ADR
0026](./docs/adr/0026-the-planner-proposes-for-a-place.md).

It is a proposal, not a prescription: it has no idea what hurts today, which is
why every block shows its reasoning, any block can be swapped, "Something else"
asks again, and nothing is gated on doing what it says. A snack is recorded as
a proposal and what became of it; the log only ever holds what you did ([ADR
0025](./docs/adr/0025-a-snack-is-a-proposal-not-a-session.md)).

### Nudges

The app decides when to speak by running the spacing score's own ideal forward:
the snacks still owed today, spread evenly across what is left of your waking
hours, measured from the last one you logged. Log one early and the rest spread
out behind it; miss one and the next is due now. Nothing carries over, and a
snack that no longer fits before the evening is dropped rather than crammed in.
Recurring busy times are routed around, and you can pause for an hour, the rest
of the day or a week.

At most one nudge per snack, plus an optional single follow-up and whatever you
snooze, under a daily cap, never while you are mid-snack. The snack is planned
when the nudge is sent, so it fits where you are then. Each nudge is sent once
however many copies of the app are running. See [ADR
0027](./docs/adr/0027-nudges-run-the-spacing-ideal-forward.md).

Nudges are Web Push, so they need HTTPS; on iPhone and iPad, add the app to the
Home Screen first (iOS 16.4 or later). Settings → Nudges walks through it and
sends a test.

## Running it

```bash
git clone https://github.com/dm807cam/snackexercise-tracker.git
cd snackexercise-tracker
cp .env.example .env        # optional; set TZ and an OpenRouter key
docker compose up -d --build
```

Then open `http://<your-host>:3000`. A fresh instance sends its first visitor to
`/setup` to create the admin account — so that is you, either be first, set
`SETUP_TOKEN` (the page asks for it), or set `ADMIN_EMAIL` and `ADMIN_PASSWORD`
to create the admin at start-up. Everyone else joins by an invitation link from
Administration. An instance that predates accounts keeps its log: the first
admin inherits it.

On a phone, use "Add to Home Screen" — it installs as a standalone app, and on
iPhone that is also what lets it receive nudges.

**Reaching it from outside your network** — which the travelling half of the
premise needs — means HTTPS in front: a reverse proxy such as Caddy, or a
tunnel. Set `APP_URL` to the public address and `TRUST_PROXY` to the number of
proxies. Nudges need HTTPS in any case. [docs/operations.md](./docs/operations.md)
covers this, health checks, metrics, backups, upgrades and recovery;
[SECURITY.md](./SECURITY.md) covers what is protected and how.

If port 3000 is already taken on the host, set `APP_PORT` (in `.env`, or as a
stack variable when deploying through Portainer) — the container always listens
on 3000 internally, only the published port changes.

The database lives in a Docker-managed volume called `snackexercise-data`, so it
survives rebuilds and restarts. To keep it somewhere you can see and back up — a
NAS share, say — change the mount in `docker-compose.yml` to a host path, with
`/data` still as the target, which is where the container writes regardless:

```yaml
    volumes:
      - /srv/snackexercise:/data
```

Docker leaves a bind-mounted directory's ownership exactly as it finds it,
unlike a fresh managed volume, which it seeds from the image. A root-owned
directory therefore fails at start-up with a read-only database, so hand it to
the user the server runs as first: `sudo chown 1000:1000 /srv/snackexercise`.

Set `TZ` to your own zone in `docker-compose.yml`: it is the zone a new account
starts in, and decides where one day ends and the next begins, so a 23:30 snack
lands on the right evening. Everyone can set their own in Settings — someone
who flies Berlin to Boston changes it on landing.

The container applies migrations and seeds the exercise catalogue on every
start. Both steps are idempotent, so restarting is always safe.

### Voice entry

Optional, and the app is fully usable without it. Put an
[OpenRouter](https://openrouter.ai) key in Settings and the "Say it" tab
appears. An admin can share one key with everyone who has none of their own
(Administration, or `OPENROUTER_API_KEY` on the first run). Dictate with your phone
keyboard's microphone; the text goes to OpenRouter, which returns structured
entries constrained by a strict JSON schema.

**Nothing is saved until you confirm it.** The parsed entries are shown in an
editable review sheet first — a misheard "225" silently entering your history is
worse than no entry at all. Movements the catalogue doesn't know come back
flagged, with a suggested muscle mapping you can accept or change.

The key is stored server-side and never sent to the browser or included in
exports.

### Steps from your phone

The realistic way to get steps in is an automation, with a token that can do
nothing but record steps: Settings → Apps and automations → New token, tick
*Record steps and brisk minutes*, and copy it (it is shown once). On iOS, a
Shortcut:

1. **Get Health Sample** — Steps, *Today*, Sum
2. **Get Health Sample** — Exercise Minutes, *Today*, Sum
3. **Get Contents of URL** — `https://<your-host>/api/metrics/` + today's
   date as `yyyy-MM-dd`, method `PUT`, header
   `Authorization: Bearer <your token>`, request body JSON
   `{"steps": <the number>, "activeMinutes": <the minutes>, "source": "shortcut"}`

Add it to a personal automation at 23:50 daily. The endpoint upserts, so
re-running it corrects the day rather than adding to it. On Android the same
call works from Tasker or HTTP Shortcuts.

`activeMinutes` is optional, and worth sending. A bare step count is credited as
*incidental* walking, because a daily total is mostly kitchen, corridor and
shop; minutes the phone counted as brisk are credited at the brisk rate
instead. Leave it out of the body entirely and whatever is already recorded for
that day stays — the app only clears it when you explicitly send `null`.

The token can be revoked from Settings at any time, and can do nothing else —
not read your log, not sign in, not issue more tokens. The same kind of token,
with the *calendar* scope, is what Settings → Apps and automations → *Get a
calendar link* issues for subscribing to your snack plan from Apple Calendar,
Google Calendar or Outlook.

To backfill history, Settings takes a CSV with a date column and a steps column;
an Apple Health, Google Fit or Fitbit export works as-is, and several rows for
the same day are added together.

### Backups

Everything lives in one SQLite file on the `snackexercise-data` volume. Take a
consistent copy while it runs, then copy it out:

```bash
docker exec snackexercise-tracker node dist/admin.mjs backup /data/backup-$(date +%F).db
docker cp snackexercise-tracker:/data/backup-$(date +%F).db .
```

The same CLI lists accounts, issues a password-reset link, makes an admin and
re-enables an account — the way back in if the only admin forgets their
password. See [docs/operations.md](./docs/operations.md).

Settings → *Export everything* also produces a JSON file containing your entries
**and** the exercise catalogue with its muscle and cardio weightings, **and**
your daily step counts — entries alone couldn't reproduce the body map, the
radar or the balance marker. Importing adds to what's there and skips entries it
recognises, so re-importing the same file won't double your history. Exports
from before cardio existed (`version: 1`) still restore. An export is per
account: yours, and the movements you can see.

## Development

```bash
npm install
cp .env.example .env
npx prisma migrate deploy && npm run db:seed
npm run dev
```

Then open `http://localhost:3000` (localhost, not `127.0.0.1`: the dev server
only serves its hot-reload socket to the origin it was started for), which
sends you to `/setup` for the first account.

| Command | |
| --- | --- |
| `npm run dev` | dev server |
| `npm run build` | production build |
| `npm test` | unit and integration tests (Vitest) |
| `npm run test:e2e` | browser tests (Playwright) |
| `npm run typecheck` | TypeScript |
| `npm run admin -- list` | the operator CLI, against your dev database |

The integration tests (`tests/integration/`) run the real route handlers
against a freshly migrated SQLite file per test file, as several signed-in
people and tokens: isolation between accounts, the account flows, token scopes,
and the nudge job with Web Push stubbed. The browser tests start from a fresh
instance, create the first admin through `/setup`, and run signed in.

### CI

`.github/workflows/ci.yml` runs on every push to `main` and every pull request,
in two parallel jobs:

- **Typecheck, unit tests, build, browser tests** — the commands in the table
  above, on Node 22 to match the container.
- **Container builds and serves** — builds the image, starts it with an admin
  created from the environment, waits for `/api/ready` (migrated, seeded),
  signs in, reads the catalogue with the session, checks an anonymous read is
  refused, and runs the operator CLI inside it. Building is not the same as
  working: the runtime stage assembles the standalone bundle, the Prisma CLI,
  the seed and the CLI by hand, and a mistake there only shows when the
  container is asked to start.

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
app/
  (app)/             the signed-in pages: today, snack player, calendar, stats,
                     settings, admin
  (auth)/            setup, sign-in, sign-up, invitations, password resets
  api/               the API; every route starts with authenticate()
components/
  BodyMap/           front/back diagrams and their geometry
  DayView/           day page: header, swipe, entry list, spacing, goal rings
  Snack/             the Snack now card, plan preview and guided player
  QuickAdd/          the "Say it" / "Manual" sheet
  Settings/          places, nudges, tokens, account, and the rest
  Admin/             the administration console
  Stats/             radar chart, balance gradient, spacing card
lib/
  auth/              passwords, sessions, tokens and scopes, links, the guard
  snack/             the snack planner, places and equipment, readiness,
                     preferences, dosing, the nudge schedule (pure), and the
                     services that feed them
  jobs/              the scheduler: nudges, housekeeping, leases
  queries.ts         every read, scoped by user id first
  muscles.ts         muscle taxonomy — the single source of truth
  scoring.ts         effective-set aggregation (pure, unit tested)
  cardio.ts          MET-minutes, pace equations, step credit (pure)
  balance.ts         the strength/cardio index (pure)
  spacing.ts         how well a day was broken up (pure)
  daily-goal.ts      how much of today is still to do (pure)
  suggest.ts         which muscle group has waited longest (pure)
  push.ts            Web Push delivery
  dates.ts           local-day arithmetic and formatting
  openrouter.ts      LLM client and response schema
prisma/              schema, migrations, catalogue seed, operator CLI
tests/               unit tests; integration/ runs the real routes
e2e/                 browser tests
```

A few decisions worth knowing before changing things:

- **`SetEntry` has no parent workout or session.** The absence is the design.
  A guided snack is recorded beside the log, never above it
  ([ADR 0025](./docs/adr/0025-a-snack-is-a-proposal-not-a-session.md)).
- **Every query takes the user id first.** There is no ambient current user a
  query could forget to filter on
  ([ADR 0023](./docs/adr/0023-accounts-own-their-data.md)).
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
