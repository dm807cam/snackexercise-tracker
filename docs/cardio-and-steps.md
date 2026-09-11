# Cardio, daily steps, and the strength–cardio balance

A design note. **This is now built** — the note is kept as the reasoning behind
the shape, and the decisions it reaches are recorded individually as
[ADRs](./adr/). Where the implementation diverged from the plan below, the ADRs
are the authority.

The app currently answers one question well — *am I hitting every muscle, or
have I quietly not trained hamstrings in three weeks?* Adding cardio and steps
introduces a second question — *am I actually training two qualities, or have I
drifted into being a lifter who walks a bit?* — and the two questions want
different maths. Most of this note is about not letting the second one corrupt
the first.

---

## 1. Why cardio and steps don't fit the current model

`SetEntry` is *one thing you picked up and moved*, scored as **effective sets**:
each set credits its muscles at 1.0 / 0.5 / 0.25. Everything downstream — the
body map, the radar, the calendar shading, "days since last trained" — is a view
over that one number.

Two things break if cardio and steps are pushed through it unchanged:

**Cardio has no honest effective-set count.** A 40-minute run at 10 km/h logged
as `sets: 1` would credit quads 1.0, hamstrings 0.5, calves 0.5 — roughly the
same as one set of split squats. The radar would then report that the run
provided hypertrophy volume, which it did not. Log it as `sets: 40` to reflect
the effort and the body map turns solid red and the "needs attention" list —
the point of the app — goes quiet for legs for a fortnight. There is no set
count that is both honest about effort and honest about stimulus, because
effective sets measure *stimulus for growth*, and cardio's stimulus is
cardiorespiratory. It needs its own currency.

**Steps aren't an event.** They're one number per day, arriving from a phone
after the fact, with no time, no exercise, and no muscle mapping. Forced into
`SetEntry` they'd inflate `entryCount`, `sets`, `activeDays` and the calendar
shading, and every existing query would silently start lying.

So: cardio joins `SetEntry` (it *is* a discrete thing you did at a time), steps
get their own table (they aren't), and both get scored in a currency that isn't
effective sets.

---

## 2. Data model

### 2.1 Cardio rides on `SetEntry`

Keep the design decision the README already commits to — no session entity, one
flat log — and extend it:

```prisma
model Exercise {
  // ...
  /// 0 = pure resistance, 1 = pure cardio, in between = genuinely both.
  /// Burpees 0.5, kettlebell swings 0.4, rowing 0.8, running 1.0, bench 0.
  cardioBias Float @default(0)
  /// Default metabolic cost, from the Compendium of Physical Activities.
  /// Used only when pace and heart rate are both absent.
  mets       Float?
}

model SetEntry {
  // ...
  distanceM      Float?
  avgHeartRate   Int?
}
```

Three notes on why it's shaped this way:

- **`cardioBias` is continuous, not an enum.** A binary `modality` field forces
  a lie about kettlebell swings, burpees, sled pushes and circuits — exactly the
  movements this app's users actually do in a basement. A float lets one entry
  contribute to both sides in proportion, which is also precisely what the
  balance metric in §5 needs. It mirrors the `ExerciseMuscle.weight` convention
  already in the codebase, and lands in the same "editable in Settings" story.
- **It lives on `Exercise`, not `SetEntry`.** It's a property of the movement,
  not of the occasion, so it stays out of every write path and can be corrected
  retroactively for the whole history.
- **No new table for cardio.** Entry CRUD, undo, the day list, export/import,
  swipe navigation and the voice flow all keep working with no branching.

`durationSec` already exists. `distanceM` and `avgHeartRate` are the only new
per-entry columns, and both are nullable — consistent with the app's rule that
you log what you know.

**Catalogue additions** (~20 rows in `prisma/exercise-catalogue.ts`), each with
`cardioBias`, `mets` and a *deliberately thin* muscle mapping:

| Movement | cardioBias | METs (default) | muscles |
| --- | --- | --- | --- |
| Run / Treadmill run | 1.0 | 9.8 | quads 0.25, calves 0.25, hamstrings 0.25 |
| Walk / Hike | 1.0 | 3.5 / 6.0 | calves 0.25 |
| Cycle / Stationary bike | 1.0 | 7.5 | quads 0.25 |
| Row (erg) | 0.8 | 7.0 | lats 0.5, mid-back 0.5, quads 0.5 |
| Swim | 1.0 | 7.0 | lats 0.25, front-delts 0.25 |
| Jump rope | 1.0 | 11.0 | calves 0.5 |
| Stair climb | 1.0 | 9.0 | quads 0.25, glutes 0.25 |
| Elliptical | 1.0 | 5.0 | — |
| Burpee | 0.5 | 8.0 | chest 0.5, quads 0.5, front-delts 0.5, abs 0.5 |
| Kettlebell swing (existing) | 0.4 | 9.8 | *unchanged* |
| Sled push (existing) | 0.3 | 8.0 | *unchanged* |
| Battle rope, Assault bike, Sandbag carry (existing) | 0.3–0.9 | 8.0–10.0 | *unchanged* |

The thin muscle mappings matter: they're what stops a run from claiming leg
volume. §6 explains how they're used.

### 2.2 Steps get their own table

```prisma
/// One row per local day. Not a log of anything you did on purpose — a
/// measurement of the day. Keyed by the same "YYYY-MM-DD" every other query
/// already uses, so joining costs nothing.
model DailyMetric {
  localDate String @id
  steps     Int?
  source    String @default("manual")  // "manual" | "shortcut" | "import"
  updatedAt DateTime @updatedAt
}
```

`localDate` as the primary key is the whole trick: it's already the app's
universal day currency, so every day / calendar / window query picks steps up
with an index lookup and no timezone arithmetic — the same reasoning that
justified denormalising it onto `SetEntry` in the first place. The table is
deliberately shaped to grow later (resting HR, bodyweight, sleep) without
another migration argument.

**Three ways in**, in expected order of use:

1. **iOS Shortcuts / Tasker automation.** The realistic path: a shortcut that
   runs at 23:50, reads *Steps → Today*, and `PUT`s to `/api/metrics/:date`.
   This is a self-hosted, LAN-only app with no auth, so the shortcut needs
   nothing but the URL. Ship the shortcut recipe in the README.
2. **Manual**, a number field on the day page next to the date. Two taps when
   you notice the phone said 11k.
3. **Bulk import**, extending `/api/import` to accept a `dailyMetrics` array,
   plus a CSV path for Apple Health / Google Fit / Fitbit exports — which is how
   anyone will backfill history.

And a fourth, nearly free: the voice parser already returns structured JSON;
adding a `steps` channel means "I walked eleven thousand steps today" works.

---

## 3. Making cardio measurable: MET-minutes

Effective sets can't score a run. Four candidate currencies:

| Currency | Verdict |
| --- | --- |
| **Minutes** | Treats a 60-min walk as 1.5× a 40-min interval session. Wrong. |
| **Kilocalories** | Needs bodyweight (the setting exists) and makes a heavy person look fitter than a light one at identical effort. Wrong for a *balance* measure. |
| **sRPE (session RPE × minutes)** | The sports-science standard, but requires you to rate every session 1–10. Nobody logging one-handed on the stairs will do this. |
| **MET-minutes** | Intensity × duration. Bodyweight-independent, has a published guideline anchor, and degrades gracefully when you only know duration. ✅ |

**MET-minutes** it is: `METs × minutes`. The anchor is that the WHO's weekly
target — 150 min moderate *or* 75 min vigorous — is about **500–1000 MET-min
per week**, and both halves of that "or" land in the same place (150 × 4 = 600;
75 × 8 = 600), which is the tell that it's the right unit. **600 MET-min/week**
becomes the cardio target.

### 3.1 Deriving METs, best evidence first

```
1. avgHeartRate present  →  scale the movement's METs by intensity from %HRmax
2. distance + duration   →  ACSM metabolic equations (exact, standard)
3. neither               →  Exercise.mets from the catalogue
4. no METs at all        →  6.0, the generic "vigorous effort" fallback
```

The ACSM equations for step 2, with speed `S` in m/min:

```
walking (1.9–6.4 km/h):  VO2 = 0.1·S + 3.5          METs = VO2 / 3.5
running (≥ 6.4 km/h):    VO2 = 0.2·S + 3.5          METs = VO2 / 3.5
```

Cycling gets a speed lookup instead — the ACSM leg-ergometer equation needs
watts, which nobody logs.

Sanity check against the Compendium: walking 5 km/h → 3.4 METs (Compendium 3.5);
running 10 km/h → 10.5 (Compendium 9.8); running 16 km/h → 16.2 (Compendium
14.5). The equations run ~5–8% hot at speed. That's fine and worth stating
plainly: **MET-minutes are a ±20% instrument.** They are used here only inside a
*ratio*, where a systematic bias on the cardio side moves the marker far less
than it moves either number alone.

### 3.2 Duration when you didn't log one

Rep-based mixed movements — 3 × 15 burpees — have a real cardio cost and no
`durationSec`. Impute rather than discard:

```ts
const estimatedSec = sets * (reps != null ? reps * 3 : 45);
```

Three seconds a rep, 45 seconds a set. Crude, clamped, and applied *only* to the
cardio side of the calculation — the strength side already has an honest number
and doesn't need a guess.

---

## 4. Steps: the honest treatment

Steps are the part most likely to produce a metric the user doesn't believe, so
three corrections before they count for anything.

**Subtract incidental living.** Walking to the kitchen isn't training. Credit
only steps above a baseline. A fixed default (4,000) is a bad answer for both a
desk worker and a nurse, so make it **empirical: the 25th percentile of the
user's own daily step counts over the last 90 days**, with a floor of 3,000, a
fixed 4,000 fallback until there are 14 days of data, and a manual override in
Settings. It self-calibrates to whatever your ordinary day is.

**Convert the excess to MET-minutes:**

```ts
metMin = max(0, steps - baseline) / 110 * 3.5 * stepWeight
```

110 steps/min is ordinary walking cadence; 100 spm is the usual threshold for
moderate intensity, so 3.5 METs is right for what's left after the baseline.

**Discount it.** `stepWeight` defaults to **0.5**. The WHO would count these
minutes at full value, and for health it's right to. But the question on the
stats page isn't "am I meeting activity guidelines", it's "is my *training*
cardio or strength", and low-intensity ambulation is activity rather than
training. Half weight keeps a walker's 12k days visible without letting them
swamp a lifter's actual sessions. Settings offers off / half / full, and the UI
always shows the steps contribution broken out, so the number is never a black
box the user has to take on faith.

**Deduplicate against logged cardio.** A logged 5 km run is also ~7,000 steps on
the phone; counting both is double-counting the same run. For foot-based cardio
(run, walk, hike):

```ts
impliedSteps = distanceM != null
  ? distanceM / strideM              // 0.75 m walking, 1.15 m running
  : durationMin * cadence;           // 110 walking, 165 running
creditedSteps = max(0, steps - baseline - impliedSteps);
```

Without this, a runner's marker drifts cardio-ward for a reason that is purely
an artefact of the sensor.

---

## 5. The balance index

### 5.1 The idea in one line

Convert each side to **a fraction of its own weekly guideline dose**, then take
cardio's share of the total. Normalising by targets rather than raw units is
what makes 50/50 mean something real: `S = 1` and `C = 1` both mean "met the
guideline", so a marker in the middle means *equally on target for both*, not
"the arbitrary units happened to tie".

### 5.2 The dose

Over the selected window (7 / 30 / 60 / 90 / 180 days), in **guideline-weeks**:

```
S = Σ effectiveSets(entry) × (1 − cardioBias)          /  60
C = [ Σ metMinutes(entry) × cardioBias  +  Σ stepMetMinutes(day) ]  /  600
```

> **Amended.** The strength side now counts **hard sets** (~27/week), not
> summed effective sets. See ADR 0016; the reasoning below stands, but the
> scalar it applies to is the normalised one.

- **Strength target 60 effective sets/week.** Effective sets rather than raw
  sets because the pipeline already computes them and they weight a deadlift
  (4.25) above a wrist curl (1.0), which is what a load proxy should do. Since
  the app's weightings mean one hard set generates ~2.2 effective sets, 60 ≈ 27
  hard sets/week — consistent with the WHO's "≥2 muscle-strengthening days" and
  with the hypertrophy literature's ~10 sets per muscle group per week.
- **Cardio target 600 MET-min/week**, per §3.
- **`cardioBias` splits mixed work in both directions.** A set of kettlebell
  swings (bias 0.4) gives 60% of its effective sets to `S` and 40% of its
  MET-minutes to `C`. Nothing is counted twice; nothing is discarded.
- Both are **window totals**, not per-week rates. That matters in §5.4.

### 5.3 The share

The naive answer is `p = C / (C + S)`. It's right in the middle of the range and
wrong at the edges: a single ten-minute walk in an otherwise empty week gives
`p = 1.0` — "100% cardio" — from nothing. Add a weak prior instead:

```
p = (C + k/2) / (C + S + k)          k = 0.5
```

This is the posterior mean of a Beta(k/2, k/2) prior over "what share of a unit
of dose is cardio", with half a guideline-week of pseudo-dose split evenly. With
no data it sits at 0.5; with real data the prior washes out within a couple of
weeks. Same formula, better behaviour at both ends and no special-casing.

If a signed number is wanted for a diverging scale, `B = 2p − 1 ∈ [−1, +1]`:
−1 pure strength, 0 balanced, +1 pure cardio.

### 5.4 Confidence, from the same distribution

The Beta posterior also hands over the uncertainty for free:

```
sd = sqrt( p(1 − p) / (C + S + k + 1) )
```

Draw the marker as a band of `p ± sd` rather than a needle. It's wide when
there's little logged and narrows as the window fills — which is why §5.2 uses
window totals: a 180-day window at the same weekly rate as a 7-day window
*should* be more certain, and per-week normalisation would have thrown that away.

| Situation | band half-width |
| --- | --- |
| Nothing logged | ±0.41 (essentially "unknown") |
| One 20-min walk, 7-day window | ±0.39 |
| Solid 30-day window, both qualities | ±0.13 – 0.21 |
| 180-day window | ±0.07 |

### 5.5 Does it behave? Worked examples, 30-day window

| Profile | S | C | Reads as |
| --- | --- | --- | --- |
| Lifter, 40 hard sets/wk, 5k steps/day, no cardio | 6.29 | 0.80 | **86% strength** ±0.12 |
| Snack trainer: 15 hard sets/wk, 7k steps/day | 2.36 | 1.99 | **54% strength** ±0.21 |
| Lifts 2×/wk, runs 4×45 min, 8k steps | 3.14 | 13.96 | **81% cardio** ±0.09 |
| Walks 12k/day, lifts nothing | 0 | 6.36 | **96% cardio** ±0.07 |
| 30 hard sets/wk + 3×40 min @ 8 METs | 4.71 | 7.65 | **61% cardio** ±0.13 |
| One 10-minute walk, ever | 0 | 0.03 | **53% cardio** ±0.40 |

The two that prove it works are the second and the last. A snack trainer who
walks a normal amount lands at a believable 54/46 rather than being flipped to
"cardio athlete" by their commute — that's the baseline subtraction and the 0.5
discount doing their job. And the degenerate case sits near the middle with a
band so wide the UI can honestly say *not enough logged yet* instead of
declaring a 100% result from one walk.

The fifth row is worth reading carefully too: 3×40 min at 8 METs is 960
MET-min/week — 1.6× the cardio guideline — against 66 effective sets, 1.1× the
strength target. "61% cardio" is the correct answer to *dose relative to target*,
even though it feels like a balanced week in sessions. That's the metric being
honest about what it measures, and it's why the breakdown underneath the
gradient is not optional.

---

## 6. The gradient

```
        strength ◀━━━━━━━━━━━━━━━┿━━━━━━━━━━━━━━━▶ cardio
                          ▓▓▓▓●▓▓▓
                        54% strength · 46% cardio

        Strength  2.4 wk of target   33 eff. sets/wk   (55% of 60)
        Cardio    2.0 wk of target  285 MET-min/wk     (48% of 600)
                  of which steps    ██████████ 100%
```

Specifics:

- **A diverging ramp with a neutral middle**, not a single hue. Two directions,
  neither one bad. The existing `--accent` (warm orange, oklch ~0.62–0.74 / 0.17
  / 50–58) is the natural cardio end; the strength end wants a cool counterpart
  at matched lightness and chroma — around `oklch(0.62 0.15 265)` light,
  `oklch(0.74 0.14 265)` dark — with the midpoint desaturating through
  `--surface-2` rather than muddying through grey-brown. Both ends already work
  against the app's two backgrounds because they're pinned to the same lightness
  the accent token already uses.
- **The band is the marker.** `p ± sd` as a translucent capsule with a solid
  1.5px needle at `p`. Below ~0.30 total dose, drop the needle entirely and
  render "not enough logged yet" — a marker on a 0.4-wide band is a lie told
  precisely.
- **A tick at 50%**, unlabelled and low-contrast. No green "balanced zone": the
  app has no business implying the user should be in the middle.
- **The breakdown underneath is part of the component, not a detail view.** Both
  raw doses, both targets, and the steps share of cardio. §5.5's fifth row is
  the reason — the marker alone is not interpretable without them.
- **Never colour alone.** The percentages carry the meaning in text; the
  container gets `role="img"` with an aria-label along the lines of *"Training
  balance: 54% strength, 46% cardio, based on 4.4 guideline-weeks logged."*
- **Placement**: top of the Stats page, above the radar, sharing the existing
  7/30/60/90/180 window tabs. It answers a coarser question than the radar and
  should be read first.

---

## 7. What this breaks elsewhere, and the fix

This is the part that determines whether the feature is a week or a month.

| Surface | Breakage | Fix |
| --- | --- | --- |
| **Body map** | A run credits quads/calves/hamstrings and shades the diagram as if it were leg day. | Effective sets are multiplied by `(1 − cardioBias)`, so pure cardio contributes **zero** fill. The map keeps meaning "resistance work". Later refinement: cardio-involved muscles get a thin *outline* driven by MET-min — visibly a different channel, never confusable with fill. |
| **Radar / "needs attention"** | Same distortion. | Same fix; falls out for free. Then *add* cardio as a 13th row in the "needs attention" list only — "cardio · 9d ago" — which is exactly the app's founding thesis applied to a second quality. Not a 13th radar spoke: the radar is muscle coverage. |
| **Calendar shading** | `getDailyLoad` sums effective sets, so a 10 km run day renders empty. | Shade by **combined daily dose** `S_day + C_day` in guideline-week units — the same currency as §5.2, so the calendar and the marker can never disagree. |
| **`activeDays`** | Does a 14k-step day with no entries count as active? | No. It's a training log; `activeDays` stays "days with entries". Add a separate "days moved" figure so the information isn't lost. Judgment call — flagged. |
| **`formatEntryDetail`** | Renders a run as "1 set". | Add a distance branch: `5.2 km · 27:30 · 5:17/km`. |
| **Units setting** | `kg`/`lb` exists; distance has no unit. | Derive it — `kg → km`, `lb → mi`. One setting, no new question. |
| **Export / import** | v1 schema has no cardio columns and no `dailyMetrics`. | Bump to `version: 2`, keep the v1 reader (defaults: `cardioBias: 0`, `distanceM: null`, no metrics). Round-trip test both. |
| **Voice parse** | Schema has no distance and no steps. | Add `distanceM`, `avgHeartRate` and a `steps` channel to `parsedEntrySchema` and the mirrored JSON Schema; teach the prompt that "5k in 27 minutes" is one cardio entry. `suggestMuscles` gains `cardioBias` + `mets` for unknown movements. |
| **Settings** | Four new knobs. | Only two are user-facing: steps mode (off / half / full) and step baseline (auto / number). The targets (60 / 600) live in code with a Settings override behind an "Advanced" disclosure. |

---

## 8. Implementation plan

Ordered so each phase is independently shippable and testable.

All six phases below are implemented. What actually landed:

- `lib/cardio.ts` — MET ladder, ACSM equations, step credit and de-duplication
- `lib/balance.ts` — dose, Beta-shrunk share, uncertainty
- `lib/steps-csv.ts` — the backfill parser
- `components/Stats/BalanceGradient.tsx` — the marker
- 135 unit tests, plus three browser tests covering the cardio path

**Phase 1 — data.** Migration for `Exercise.cardioBias`, `Exercise.mets`,
`SetEntry.distanceM`, `SetEntry.avgHeartRate`, `DailyMetric`. Catalogue rows and
`cardioBias`/`mets` backfill for existing mixed movements. All columns nullable
or defaulted; the migration is additive and the seed stays idempotent.

**Phase 2 — the maths, pure and tested.** `lib/cardio.ts` (MET derivation
ladder, ACSM equations, duration imputation, step conversion and dedup) and
`lib/balance.ts` (dose, Beta share, sd). No database access, same discipline as
`lib/scoring.ts`, unit tests covering every row of §5.5 plus the degenerate
cases. Modify `muscleEffectiveSets` to apply `(1 − cardioBias)`.

**Phase 3 — API.** `GET/PUT /api/metrics/:date`, `GET /api/metrics?start=&end=`,
extend `entryInputSchema`/`entryUpdateSchema`, extend `/api/stats` to return a
`balance` block, switch `getDailyLoad` to combined dose.

**Phase 4 — UI.** `BalanceGradient` on Stats; distance / avg-HR fields in
`ManualForm`, shown when `cardioBias > 0`; steps field on the day page; cardio
row in "needs attention"; `formatEntryDetail` distance branch.

**Phase 5 — ingest.** Export/import v2, CSV step import, the iOS Shortcut recipe
in the README.

**Phase 6 — polish.** Voice schema and prompt; the body-map cardio outline; the
Settings knobs.

Phases 1–4 are the feature. 5–6 are what make it usable a month later.

---

## 9. Decisions worth arguing about

1. **`stepWeight = 0.5`.** Defensible, not derivable. The WHO would say 1.0. The
   alternative is to keep steps out of the balance entirely and show them as a
   third, separate number.
2. **`activeDays` ignores steps.** Consistent with "it's a training log", but a
   16k-step hiking day arguably *is* an active day.
3. **The strength target of 60 effective sets/week** is calibrated to this app's
   own weighting convention (~2.2 effective sets per hard set). If those
   weightings are ever edited in Settings, the target drifts with them — worth a
   comment in the code so it isn't mistaken for a literature value.
4. **Cardio doesn't appear on the radar.** Correct for a muscle-coverage chart,
   but it does mean the radar and the balance marker tell partly disjoint
   stories, and the Stats page has to make that legible.

---

### References

- WHO, *Guidelines on physical activity and sedentary behaviour*, 2020 — 150–300
  min moderate or 75–150 min vigorous per week, plus muscle-strengthening on ≥2
  days; the 500–1000 MET-min/week equivalence.
- Ainsworth et al., *2011 Compendium of Physical Activities* — MET values.
- ACSM, *Guidelines for Exercise Testing and Prescription* — the walking and
  running metabolic equations.
- Tudor-Locke et al. on cadence — 100 steps/min as the moderate-intensity
  threshold.
