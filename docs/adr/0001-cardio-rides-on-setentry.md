# 1. Cardio is a `SetEntry`, not a new table

**Status:** Accepted · 2026-09-07

## Context

The log has exactly one unit: `SetEntry`, "one thing you picked up and moved, at
a point in time". The README commits to the absence of a session entity as a
design decision. Cardio has to go somewhere.

## Decision

Cardio is a `SetEntry`, with two new nullable columns — `distanceM` and
`avgHeartRate` — and nothing else.

## Why

A run *is* a discrete thing you did at a time, which is precisely what
`SetEntry` models. Everything downstream then works with no branching: entry
creation, editing, deletion and undo, the day list, swipe navigation, the voice
confirm sheet, export and import. A `CardioEntry` table would have needed a
parallel implementation of all of it, and every query that currently reads "the
log" would have become a union of two tables.

`durationSec` already existed. The genuinely new facts about a run are how far
it went and how hard the heart worked, so those are the only two columns added.

## Rejected

**A separate `CardioEntry` table.** Cleaner on paper — no nullable columns that
are meaningless for a bench press — but it buys schema tidiness with duplicated
behaviour in about a dozen places, and it would have forced the very
session/activity split the app exists to avoid.

**A polymorphic `activity` table.** Same cost, plus the loss of type safety at
the Prisma layer.

## Consequences

`SetEntry` carries two columns that are null for most rows. That is the same
trade already made for `reps`, `weightKg` and `durationSec`, and it is the
cheaper half of the bargain.
