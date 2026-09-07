# 6. A Beta prior supplies both the marker and its band

**Status:** Accepted · 2026-09-07

## Context

The naive share `C / (C + S)` is well behaved in the middle of its range and
badly behaved at the edges. One ten-minute walk in an otherwise empty week
reads as "100% cardio" — a maximally confident claim from a single data point.

## Decision

```
p  = (C + k/2) / (C + S + k)              k = 0.5
sd = sqrt( p(1 - p) / (C + S + k + 1) )
```

The marker is drawn at `p` as a band of `p ± sd`. Below a total dose of 0.3
guideline-weeks no marker is drawn at all.

## Why

Treating each guideline-week of dose as evidence about "what fraction of a unit
of training is cardio" makes this a Beta posterior. `p` is its mean and `sd` its
standard deviation, so **one distribution supplies both the position and the
honest width of the answer**, with no second mechanism invented to express
confidence.

The prior is Beta(k/2, k/2) — half a guideline-week of imaginary dose, split
evenly. With no data the marker sits at 0.5; with real data it washes out inside
a couple of logged weeks. It costs nothing when there is evidence and prevents
the degenerate claim when there is not.

Because ADR 5 uses window totals, the band narrows as the window fills: ±0.41
with nothing logged, ±0.13-0.21 over a solid 30 days, ±0.07 over 180. That is
the behaviour a reader expects and would not have got from per-week rates.

## Rejected

**A hard "not enough data" threshold alone.** Binary, and it would still have
drawn a needle the moment the threshold was crossed.

**tanh of a log-ratio.** Smooth and bounded, and it needs a scale constant
chosen by taste, and it says nothing about confidence.

**Bootstrapping over days.** Defensible, far more code, and the answer is
already available in closed form.

## Consequences

`k` is a tuning constant. At 0.5 it is weak enough to be invisible after two
weeks of real logging and strong enough to kill the one-walk case; that range is
wide, so the exact value is not delicate.
