# 11. Spacing is scored by gap concentration against a target frequency

**Status:** Accepted · 2026-09-07

## Context

The app's founding claim is that scattered snacks beat one block, and nothing in
it measured whether the snacks were actually scattered. Thirty effective sets at
19:00 and the same thirty spread over six visits to the pull-up bar scored
identically everywhere: same volume, same radar, same calendar shading, same
active day. Breaking up sedentary time is a separate exposure with its own dose,
and the app was silent about it.

## Decision

A per-day **spacing score** in `lib/spacing.ts`. Entries within 15 minutes of
each other merge into one *bout*. The bouts cut the user's active window into
n + 1 gaps; with `p_i` each gap's share of the window,

    score = (1 / m) / sum(p_i^2),   m = max(n + 1, TARGET_BOUTS + 1)

`sum(p_i^2)` is the Simpson concentration of the gaps — `1/(n+1)` when they are
all equal, approaching 1 when one gap swallows the day. `TARGET_BOUTS` is 5.

The active window defaults to 08:00–22:00 and is configurable. It **expands** to
cover anything logged outside it and never contracts. Days with nothing logged
score `null`, not zero.

## Why

The measure had to reward two things at once — more bouts, and evener bouts —
and evenness alone rewards neither honestly: one set at noon cannot be clustered,
so pure evenness rates it 0.85. The `m` floor is what makes frequency count: a
day is scored against one broken up every ~2.8 waking hours, so a single bout
scores about 0.28 and five even ones score 1.

Merging bouts stops the metric from being farmable. Without it, logging one
session as five entries buys the same score as five genuine visits, and the
number would measure logging habits rather than behaviour.

Window expansion is the conservative direction. A 05:30 run is genuinely early
rather than something that happened at the stroke of eight, and expanding can
only make evenness harder — so nobody can shrink the day down to the hour they
trained in and score a perfect one.

`null` for an empty day, because a rest day is not a badly spread day. Averaging
zeros in would make this a second, worse activity count.

## Rejected

**Coefficient of variation of the gaps.** Unbounded above, so no natural 0..1
score, and it says nothing about frequency.

**Hourly-bin entropy.** Bin edges become the metric: 17:59 and 18:01 land in
different bins and score better than 18:00 and 18:02.

**Weighting bouts by volume or duration.** This measures how often sitting was
interrupted; a two-minute set of squats interrupts it exactly as well as twenty
minutes of them. Volume is already measured, thoroughly, everywhere else.

## Consequences

Timestamps now carry weight they did not before, which is why entries became
retimeable in the same change — see [0012](./0012-times-are-typed-not-stamped.md).
Without that, the score would have measured when the user reached for their
phone.

`TARGET_BOUTS = 5` is a judgment call, not a literature value. The literature
supports breaking up sedentary time; it does not name a number of bouts a day.
Five is defensible and adjustable, and moving it rescales every historical score
— it is a property of the scale, like the strength target in `lib/balance.ts`.
