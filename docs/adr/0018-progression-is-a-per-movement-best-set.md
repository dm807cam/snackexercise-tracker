# 18. Progression is a per-movement best set, and a stall is weeks without one moving

**Status:** Accepted · 2026-09-11

## Context

Every measure in this app was a **coverage** measure: did you hit everything,
how recently, how evenly spread, how much per muscle. None of them answers "am I
doing more than I was?" for any individual movement.

`SetEntry` has stored `reps`, `weightKg`, `durationSec` and `exerciseId` since
the first migration, and `getExercises` / `getRecentExerciseIds` already index
per-exercise history. Nothing read it as a time series. `totalTonnage` summed a
window into one scalar and showed it as "Moved: N kg" — a figure that moves with
how much you logged rather than with how strong you got, and which is simply
zero for a pure-calisthenics user.

Coverage without progression produces maintenance, not the outcome this app is
aimed at. Progressive overload is the mechanistically necessary condition for
continued hypertrophy — the organising principle of the ACSM progression model
(Ratamess et al. 2009) and of every hypertrophy review since.

Two things make it more urgent here than in a session app:

- **Bodyweight movements dominate.** Their load is fixed by definition, so
  progression comes from reps, tempo, range or a harder variation. A trainee
  doing 3 × 10 push-ups for eight months has a perfectly flat stimulus, and the
  rest of the stats page reports it as eight months of consistent volume — a
  true statement that reads as praise.
- **There is no session structure to carry an implicit plan.** In a programme
  app, progression is encoded in the programme. Here nothing encodes it.

## Decision

**The metric is chosen per movement**, from what its own history carries
(`metricFor`): estimated 1RM where there is load and reps, best-set reps where
the load is fixed, longest hold for a plank or a carry. A movement logged
without numbers at all gets no series, which is correct — "did some pull-ups" is
a good log entry and cannot be a progression signal.

**The value is the best single set of each day**, not the day's volume.

**A stall is `MIN_SESSIONS_FOR_STALL` (6) sessions and `STALL_WEEKS` (4) weeks
with the best not moving**, measured from the *first* day the current best was
reached. It surfaces in three places: its own stats section, the existing "needs
attention" list, and the suggestion bar.

**The suggestion bar upgrades a stalled pick** to the next rung of a ladder
(`push-up → diamond push-up → dip`), kept as a slug map in `lib/progression.ts`,
and says on screen what it replaced and why.

Progression always looks back **180 days**, whatever window the rest of the page
is on.

## Why

**Best set, not volume.** A day's total reps rises when you simply do more sets,
which is volume and is measured thoroughly elsewhere. The best single set is
what has to move for the tissue to see a load it is not already adapted to.

**Best, not a fitted slope.** A regression through six scattered snack sessions
is mostly noise. "Your best has not moved in nine weeks" is more robust than a
gradient and, more importantly, is a sentence a person can act on — which "−2%"
is not.

**Epley with a rep cap.** Brzycki's `36 / (37 − reps)` is undefined at 37 reps
and absurd well before it, and this app has no rep ceiling: someone logs "50
bodyweight squats" and means it. Epley is capped at 12 reps rather than
discarding high-rep sets, so a big set still appears on the chart without
inventing a personal best.

**Its own window.** A stall is defined in weeks of unchanged best, so a 7-day
view could never show one. A progression signal that vanished when you looked at
a shorter window would be worse than none.

**The ladder lives in code, not the database.** It is a property of the
movements, not of the user's copy of them: slugs are stable, the ladder does not
vary per person, and a column would have meant a migration and a seed pass to
express something that is simply true. A custom movement has no rung, which is
also correct — the app has no idea what "Dennis's odd shoulder thing" is harder
than.

**The upgrade is conservative and explains itself.** It fires only when the
movement is genuinely stalled and only when the rung above is in the user's own
catalogue, and the bar says what it replaced. A suggestion that silently
proposed something harder than what was asked for would be the app overreaching,
and the whole design of that bar is that its reasoning is visible.

## Rejected

**A single "progression score" across the catalogue.** It would average
incomparable things — kilograms on a deadlift against reps on a plank — into a
number meaning nothing.

**Flagging a decline.** Tempting, and wrong for this app: a quiet fortnight, a
cold, a deload and a genuine regression look identical in the data, and three of
those four are not problems. A stall needs training to have *happened* and is
therefore safe to name; a drop is not.

**Counting a repeat of the current best as progress.** Anchoring `best` on the
first day it was reached is what makes "how long has it stood" answerable at
all; restarting the clock on each repeat would make a plateau invisible.

## Consequences

The stats page gains a section, and "needs attention" gains a third kind of row.
That list now carries three reasons — stale, thin, and stopped moving — which is
close to as many as one list can hold; a fourth wants a different home.

Nothing here scolds. A stall is information, and for a fixed-load movement it is
usually the signal to move up a rung rather than a failure to try, which is why
the ladder exists alongside the flag rather than after it.

"Moved: N kg" still sits on the stats page and is still zero for a
pure-calisthenics user. Whether it earns its place is left to the
body-composition work, where a bodyweight load fraction would give it a meaning
for the first time.
