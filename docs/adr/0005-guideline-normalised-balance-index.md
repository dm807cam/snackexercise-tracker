# 5. The balance marker normalises each side by its own guideline

**Status:** Accepted · 2026-09-07

## Context

The marker has to answer "is my training primarily cardio or primarily
strength" from two incommensurable measures: effective sets and MET-minutes.

## Decision

Each side is divided by its own weekly guideline dose before the two are
compared:

```
S = hard sets (strength- and effort-weighted)  /  ~27
C = MET-minutes (incl. steps)                  /  600
```

The marker is cardio's share of `S + C`. Both are **window totals** expressed in
guideline-weeks, not per-week rates.

## Why

Comparing sets to MET-minutes directly requires an exchange rate, and any
exchange rate chosen here would be arbitrary — invented, then baked into every
number the app shows.

Normalising each side against its own target dissolves the problem instead of
answering it. `S = 1` and `C = 1` both mean "met the guideline", so the midpoint
means *equally on target for both* rather than *the arbitrary units happened to
tie*. That is what makes a position on the bar interpretable at all, and it is
the single load-bearing idea in the feature.

It also makes the marker scale-invariant: doubling both sides does not move it.
Correct, because the marker answers *what kind* of training, and *how much* is
answered by the doses printed underneath it.

Window totals rather than rates because more data should mean more confidence,
and a rate throws that away — see ADR 6, which depends on this.

## The targets

**Both targets are now configurable** — amended by
[0019](./0019-targets-are-configurable-and-the-two-claims-are-separate.md). The
figures below are the defaults, the exchange rate is derived from whatever the
user sets, and the WHO floor is kept separate from the target so that raising
your sights does not erase having met the guideline.

- **600 MET-min/week** is the WHO's aerobic guideline, per ADR 4.
- **~27 hard sets/week** is calibrated to this app's own scale, not lifted from
  a paper — consistent with "muscle-strengthening on 2+ days" and with ~10 sets
  per muscle group per week across the major groups.

**The strength side counts hard sets, not effective sets** — amended by
[0016](./0016-the-scalar-dose-is-hard-sets.md). Effective sets fan out across
every muscle a movement trains, so summing them into one number made a deadlift
4.25x the dose of a triceps extension at identical effort, and moved the target
whenever the weightings were edited in Settings. The per-muscle vector is
unchanged and still correct; only the collapse to a scalar was wrong.

## Rejected

**Raw ratio of sets to minutes**, with a tuned constant. Arbitrary, and the
constant would have become folklore.

**Energy expenditure for both sides.** Would have unified the units honestly,
and would have made the answer depend on bodyweight and on a resistance-training
MET value that is close to fiction.

## Consequences

The marker reports dose against target, which occasionally surprises: three
40-minute runs a week plus 30 hard sets reads as 61% cardio, because 960
MET-min is 1.6x its guideline while 66 effective sets is 1.1x its own. That is
the correct answer to the question asked, and it is why the breakdown underneath
the gradient is part of the component rather than a detail view.
