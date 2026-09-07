# 8. Cardio contributes no effective sets

**Status:** Accepted · 2026-09-07

## Context

The radar, the body map and "days since last trained" are all views over
effective sets. Cardio entries have muscle mappings. Something has to stop a run
from feeding them.

## Decision

Every effective set is multiplied by `(1 - cardioBias)`. Pure cardio therefore
contributes exactly zero to the radar, the body map fill and "days since last
trained". Cardio gets a **separate visual channel** on the body map: an outline
in the cardio colour, scaled by MET-minutes, never a fill.

Two exceptions preserve information rather than discarding it: cardio still
counts as a set and an active day, and it gets its own row in "needs attention".

## Why

Effective sets measure stimulus *for hypertrophy* specifically. A 40-minute run
logged as one set would have the radar report leg volume the run did not
deliver; logged as forty it would silence "needs attention" for legs for a
fortnight. There is no set count that is honest about both effort and stimulus,
because they are different quantities.

But a body diagram showing nothing at all after a 10 km run is its own kind of
lie, which is why the outline exists. Keeping it as a stroke rather than a fill
means the two channels stay distinguishable at a glance and can never be read as
one number.

The "needs attention" row is the app's founding thesis applied to a second
quality: "you haven't done any cardio in nine days" is exactly the sort of thing
this app exists to notice. It is a row in that list and **not** a 13th radar
spoke, because the radar is muscle coverage and cardio is not a muscle.

## Rejected

**Giving cardio a damped effective-set credit** (say, MET-minutes ÷ 30). Would
have made one number do two jobs, and every reading of the radar would then have
needed a caveat.

**A 13th radar axis.** Breaks the chart's meaning to save a list row.

## Consequences

Someone who only runs sees a radar that is nearly empty and a "needs attention"
list that is nearly full. That is accurate — they are not doing resistance work
— but it means the stats page tells two partly disjoint stories, and the layout
has to make which is which obvious. The balance gradient sits above the radar
for this reason.
