# 2. `cardioBias` is a float, not a modality enum

**Status:** Accepted · 2026-09-07

## Context

Something has to say whether a movement is cardio or strength, so that a run
does not claim leg volume and a bench press does not claim MET-minutes.

## Decision

`Exercise.cardioBias`, a float from 0 to 1. 0 is pure resistance work, 1 is pure
cardio. It lives on `Exercise`, not on `SetEntry`.

## Why

A binary `modality` field forces a lie about kettlebell swings, burpees, sled
pushes, sandbag work and circuits — which are exactly the movements this app's
users do, because they are what is available in a basement. Calling a swing
"strength" discards its real aerobic cost; calling it "cardio" discards a
posterior chain's worth of volume.

A float lets one entry contribute to both sides in proportion, which is also
exactly the input the balance index needs: `(1 - bias)` of the effective sets go
to strength, `bias` of the MET-minutes go to cardio. Nothing is counted twice
and nothing is discarded.

It mirrors the existing `ExerciseMuscle.weight` convention, so it inherits the
established "these weightings are yours to edit in Settings" story rather than
introducing a second mental model.

Putting it on `Exercise` rather than `SetEntry` keeps it out of every write path
and makes it retroactively correctable: deciding next month that swings are
really 0.3 fixes the whole history at once.

## Rejected

**`modality: "strength" | "cardio" | "mixed"`.** Three buckets is still buckets,
and "mixed" would have needed a hidden number to score anyway.

**A per-entry override.** Today's swings are not more aerobic than last week's;
the variation that matters is already captured by duration and heart rate.

## Consequences

A movement's bias is a judgment call, and the seeded values (swings 0.4, burpees
0.5, sled push 0.3) are defensible rather than measured. They are editable, and
the seed only backfills rows that have never been touched.
