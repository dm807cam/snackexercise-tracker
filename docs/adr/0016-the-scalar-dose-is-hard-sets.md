# 16. The scalar strength dose is hard sets, not summed effective sets

**Status:** Accepted · 2026-09-11 · amends [0005](./0005-guideline-normalised-balance-index.md)

## Context

Effective sets credit each muscle a movement trains by its weighting, so the
effective sets one logged set generates is the **sum of that movement's
weights**. Across the 73 non-pure-cardio movements in the catalogue that sum
ranges from **1.0 to 4.25** (mean 2.0, median 2.0):

| Movement | Effective sets per logged set |
| --- | --- |
| Deadlift | 4.25 |
| Barbell row | 3.50 |
| Back squat / Farmer's carry | 3.25 |
| Push-up | 2.25 |
| Bench press | 2.00 |
| Triceps extension / Calf raise / Neck curl | 1.00 |

Per muscle that is correct — a deadlift really does train six of them, and the
body map, the radar and "days since you trained hamstrings" all want exactly
this. But three places collapsed the vector into a **single scalar dose**, and
there the multi-muscle bonus is an artefact of movement selection:

1. **The daily strength ring** closed after 2 sets of deadlifts or 9 sets of
   triceps extensions, at identical effort and identical per-muscle stimulus.
2. **The balance marker** read a squat-and-deadlift trainer as strength-dominant
   against a curl-and-lateral-raise trainer doing the same number of hard sets —
   undercutting the marker's whole claim that the middle means on target for
   both.
3. **"About N more sets"** divided the remainder by a fixed 2.2. Close to the
   catalogue mean, and wrong by a factor of two in both directions for real
   movements: about 3 more sets after a deadlift session meant about 1, after
   arm work about 6.

A fourth problem sat underneath all three: the weightings are **editable in
Settings**, so the daily target silently moved whenever someone adjusted a row.

## Decision

Wherever effective sets collapse to one number, divide by the movement's weight
sum. The fan-out cancels, leaving

```
hard sets = sets x (1 - cardioBias) x effortMultiplier
```

which is `entryHardSets` in `lib/scoring.ts`. The weekly target becomes
`STRENGTH_TARGET_HARD_SETS_PER_WEEK` (~27.3), derived from the drawing scale so
the two cannot drift.

The **per-muscle vector is untouched**. `muscleEffectiveSets`, the body map, the
radar, the calendar shading and staleness all keep the unnormalised weights,
which is where they are correct.

`EFFECTIVE_SETS_PER_HARD_SET` survives as a property of the *drawing scale*
only — it sets where the radar's cardio line and the calendar's shading sit —
and is documented as such rather than as a claim about any movement.

## Why

**Divide rather than audit the catalogue.** The alternative was reworking the
weight sums so they varied less (Deadlift 4.25 against Romanian deadlift 2.75 is
a large gap for two very similar stimuli). That would have narrowed the spread
without removing it, and it would have been a judgment call on 73 rows where
this is one line of arithmetic that is exactly right. It also leaves the
catalogue free: rows can now be tuned for per-muscle accuracy, which is what
they are for, without moving anybody's daily target.

**Hard sets is the unit the literature already uses.** Volume targets are stated
in hard sets per muscle per week, so the scalar dose is now in the same unit as
the evidence behind it, and `EFFECTIVE_SETS_PER_HARD_SET` stops being load-
bearing for any dose claim.

**"About N more" disappears rather than being made accurate.** With the target
in hard sets the remainder *is* the actionable number — "3.9 sets to go" — so
the translation line the old scalar needed is simply gone. One number, in the
unit it is measured in, is better than two that have to agree.

## Rejected

**Computing the per-hard-set factor from the user's own entries.** Honest, and
it makes today's target depend on what was logged this week — the same class of
problem as [0014](./0014-a-daily-share-with-no-carry-over.md)'s carry-over, and
it would still leave the balance marker comparing movements to each other.

**Dropping stabiliser credit (0.25) from the sum instead.** A partial fix for
one symptom — a deadlift's lat involvement is isometric and is not a hypertrophy
stimulus for lats — and it would have degraded the body map, which is the one
place stabiliser credit is worth having.

## Consequences

The daily strength target reads **~3.9 sets** where it read ~8.6 effective sets.
The number is smaller and means more: it is sets you can count on your fingers,
not a weighted quantity.

The balance marker moves for anyone whose training is lopsided in movement
selection — compound-heavy training reads less strength-dominant than it did.
That is the correction, not a side effect.

The stats page's dose row now reads "hard sets/wk" against ~27. The balance
breakdown reports both scales, each a real sum over the same entries rather than
one converted into the other.

**The radar, the body map and the calendar deliberately stay unnormalised.** The
first two are per-muscle, where the fan-out is the right answer. The calendar is
a visual intensity on the same drawing scale as the radar, sharing the exchange
rate of [0005](./0005-guideline-normalised-balance-index.md) so the two views
cannot disagree about what a run was worth, and it names its unit ("N effective
sets") rather than implying a dose. A compound day therefore still shades darker
than an isolation day of the same set count. That is a defensible reading of
"how much did this day carry" and it keeps one currency across three views; it is
a choice, not an oversight, and the place to revisit it is here.
