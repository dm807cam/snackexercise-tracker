# 9. `activeDays` stays "days with entries"

**Status:** Accepted, contested · 2026-09-07

## Context

Once steps exist, a day can carry 14,000 steps and no logged entry. Whether that
is an "active day" changes the streak, the calendar and the oldest number in the
app.

## Decision

`activeDays` keeps its existing definition: days with at least one logged entry.
Steps are reported beside it as their own figure, and `daysWithSteps` is
returned alongside.

The calendar's shading is the deliberate exception — it uses the combined dose,
so a step-only day is not a blank square.

## Why

This is a training log. `activeDays` and the streak have always meant "days you
logged something", and quietly widening the definition would rewrite the meaning
of every streak in the user's history without touching a single stored row. A
number whose definition changes under you is worse than a number that is
slightly too narrow.

The calendar differs because it answers "what did this day contain", not "did
you train", and a 10 km run rendering as an empty square was the specific bug
being fixed.

## Rejected

**Counting a day active above a step threshold.** Reasonable, and it makes the
streak depend on a threshold nobody chose, and it retroactively creates streaks
that never happened.

## Consequences

Contested, and reasonably so: a 16,000-step hiking day with nothing logged shows
as inactive while shading the calendar. If this is revisited, the change should
be explicit and versioned, not silent — which is the whole reason it is written
down here.
