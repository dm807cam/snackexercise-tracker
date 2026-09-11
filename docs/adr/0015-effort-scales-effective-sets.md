# 15. Effort scales effective sets, and an unrated set counts as a hard one

**Status:** Accepted · 2026-09-11

## Context

`muscleEffectiveSets` credited `sets × muscleWeight × (1 - cardioBias)` and
nothing else. Ten comfortable push-ups and a set of push-ups taken to the point
where the next rep will not happen produced an identical number and closed an
identical fraction of the strength ring.

That is a validity problem rather than a rounding one. The convention the app
names — "effective sets" — is in the literature a count of **hard sets**,
conventionally a set taken to within roughly 0–5 reps of failure (Baz-Valle et
al. 2022, *J Hum Kinet*; the counting rule behind Schoenfeld and Krieger's
dose–response work). Hypertrophic effect scales with proximity to failure,
particularly at submaximal loads (Refalo et al. 2023, *J Sports Sci*).

It matters more here than it would in a session app, because the failure mode of
scattered snacks is precisely submaximal repetition: a comfortable set of ten
every time you pass the pull-up bar. That user was accruing full volume, a full
radar spoke and no "needs attention" row, on close to no hypertrophic stimulus.
The app was actively reassuring them.

## Decision

`SetEntry` gains a nullable **`effort`**: `easy` | `hard` | `failure`, one tap
in the log form and one field in the dictation schema.

It scales the effective-set credit — `easy` 0.4, `hard` 1.0, `failure` 1.05 —
wherever effective sets are counted, and nowhere else. Cardio's MET-minutes are
untouched, and a pure cardio movement is not asked for a rating at all.

**An unrated set counts as a hard set** (multiplier 1.0), and the stats page
reports what fraction of the window's sets were actually rated.

Rep range remains uncaptured and unweighted, deliberately: 5 to 30+ reps produce
similar hypertrophy when sets are taken near failure (Schoenfeld et al. 2021,
*J Strength Cond Res*), so reps stay optional and proximity to failure is the
thing asked about.

## Why

**Three chips, not an RIR number.** An RIR spinner is a number to think about on
a staircase, and a number to think about is a set that does not get logged. The
three levels map to roughly ≥5 / 2–3 / 0 reps in reserve, which is as fine as
anyone can honestly self-report mid-flight anyway.

**`easy` at 0.4 rather than 0.** A set well short of failure is a diminished
stimulus, not the absence of one. Zeroing it would have the app claiming that
something it cannot observe produced nothing at all.

**`failure` at 1.05 rather than 1.3.** Past a couple of reps in reserve the
hypertrophy curve is close to flat while the fatigue cost keeps climbing.
Paying much more for going to failure would make the app recommend a way of
training that buys little and costs recovery.

**Unrated = hard is the load-bearing choice.** Every set logged before this
column existed is unrated. Any other default silently restates the user's whole
history: a year of training loses a third of its volume overnight, the radar
shrinks, and "needs attention" fills with groups that were trained perfectly
well. A metric that changes meaning retroactively is worse than one that is
slightly generous — so the generosity is stated out loud instead, as a labelled
fraction on the stats page, rather than buried in a constant.

It also keeps `STRENGTH_TARGET_EFFECTIVE_SETS_PER_WEEK` and
`EFFECTIVE_SETS_PER_HARD_SET` meaning exactly what they meant, since both were
already calibrated on the assumption that a logged set is a hard set. Rating
sets as `easy` now lowers the dose against an unchanged target, which is the
entire point of rating them.

## Rejected

**Counting unrated sets as `easy`,** or at some blend. Honest about the app's
ignorance, and it would have made the first release of this feature look like a
collapse in the user's training.

**A required field.** The app's one rule is that you can log "did some
pull-ups" without inventing numbers. A mandatory effort chip would break it for
a variable that is optional in the literature's own counting rule too — an
unrated set is not an invalid observation, just a less informative one.

**Backfilling a guess onto old rows.** Unknown is a fact about those rows and
should stay recorded as unknown; the multiplier is where the assumption lives,
where it can be changed later without touching data.

## Consequences

The stats page carries one extra line while most sets are unrated, and it
disappears once four in five carry a rating — at which point the number is no
longer telling the user anything they cannot see.

The export format goes to version 3. The v1 and v2 readers stay, and a v2 entry
restores with no rating, which is exactly what it had.

Dictation can set the field, but only when the speaker actually says how hard it
was. "10 push-ups" stays unrated rather than being optimistically promoted.
