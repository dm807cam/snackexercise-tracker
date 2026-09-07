# 7. Steps count at half weight above a personal baseline

**Status:** Accepted, contested · 2026-09-07

## Context

Steps are the part of this feature most likely to produce a number the user does
not believe. Counted naively, a normal commute turns a lifter into a cardio
athlete.

## Decision

Three corrections before a step counts:

1. **Subtract a baseline**, defaulting to the 25th percentile of the user's own
   daily counts over 90 days (floor 3,000; fixed 4,000 until 14 days exist).
2. **Subtract steps already logged as cardio**, from distance and stride or from
   duration and cadence.
3. **Apply a discount**, `half` by default; `off` and `full` are available.

## Why

**The baseline** exists because walking to the kitchen is not training. A fixed
number is wrong for a desk worker and for a nurse in opposite directions; taking
someone's own quiet quarter subtracts *their* incidental living and re-calibrates
if their life changes.

**The de-duplication** exists because a logged 5 km run is also ~7,000 steps on
the phone. Counting both drifts a runner's marker cardio-ward for a reason that
is purely a sensor artefact.

**The discount** is the contested one. The WHO would count these minutes in
full, and for health that is right. But the question on the stats page is not
"am I meeting activity guidelines", it is "is my *training* cardio or strength",
and low-intensity ambulation is activity rather than training. Half weight keeps
a walker's 12k days visible without letting them swamp a lifter's actual
sessions.

The calibration case that decided the default: a snack trainer doing 15 hard
sets a week with a 7,000-step commute reads 54% strength at half weight, and
would read 68% cardio at full weight with a fixed 4,000 baseline. The first is
recognisable; the second is not.

## Rejected

**Excluding steps entirely.** Simplest, and it discards real information about
people whose only aerobic work is walking — for whom the marker would then read
"no cardio" while they walk 12 km a day.

**Full weight, per the WHO.** Defensible, and it makes the marker answer a
different question than the one on the page.

## Consequences

`0.5` is a judgment call and is not derivable. It is mitigated by making it a
visible setting with three positions, and by the gradient always breaking out
what share of the cardio dose came from walking — so the number is never a black
box the user has to take on faith.
