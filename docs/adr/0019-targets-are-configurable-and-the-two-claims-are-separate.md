# 19. The weekly targets are configurable, and the two claims are kept apart

**Status:** Accepted · 2026-09-11 · amends [0005](./0005-guideline-normalised-balance-index.md)

## Context

Both weekly targets were fixed constants, and both encoded a choice the app
never admitted to making.

**Cardio was the guideline *floor*.** 600 MET-min is 150 min × 4 METs — the
lower bound of the WHO 2020 range, which is 600–1200. The all-cause-mortality
dose–response does not plateau there:

- Arem et al. 2015, *JAMA Intern Med* (661,000 adults): 1–2× the minimum gives
  ~20% lower mortality; **3–5× it (~1350–2400 MET-min/wk) gives ~39%**, with the
  curve flattening past that.
- Lee et al. 2022, *Circulation* (~116,000 adults, 30 years): lowest mortality at
  150–300 min/wk vigorous or 300–600 moderate — again ~1200–2400 MET-min — with
  no harm signal up to 4× the minimum.

For a user whose stated aim is the longevity zone, closing a ring at 600 said
"you are done" where the returns are still steeply positive. Roughly half the
available benefit sat above the target.

**The strength side has the opposite shape, and one number served two goals.**
~27 hard sets a week is a *hypertrophy* dose. The resistance-training mortality
curve is J-shaped and peaks low: Momma et al. 2022, *BJSM* found maximum
all-cause mortality benefit at ~30–60 min/wk of muscle-strengthening,
attenuating and crossing null beyond ~130–140 min/wk.

## Decision

**Both targets are configurable**, in `lib/targets.ts`, with the guideline
values as the default and the basis of each named in Settings.

**A "longevity" preset** raises cardio to 1200 MET-min/wk and **leaves strength
alone**.

**The two claims are separated rather than averaged.** `GUIDELINE_FLOOR_MET_MIN_PER_WEEK`
stays fixed at 600 whatever the target is. The cardio ring carries a notch at
the floor when the target is above it, `goalHeadline` gains "Past the activity
guideline — still short of your target", and the balance breakdown says where
the guideline sits and whether the user is past it.

**The exchange rate follows the targets.** `metMinutesPerEffectiveSet` is derived
from them, so the radar's cardio line and the calendar's shading move when the
cardio target does.

## Why

**Longevity raises cardio and not strength.** The mortality-optimal resistance
dose is *lower* than the hypertrophy one, so a preset that moved strength for
longevity would have to move it *down* — away from the goal this app exists to
serve. Raising cardio and leaving strength where it is, and saying so, is the
only combination that serves both. This is the whole reason the two claims are
kept apart rather than blended into a single "on target" state.

**1200, not 2400.** 2400 is the top of the band Arem and Lee put the lowest
mortality in, and a target four times the guideline is one most people will
simply fail. The evidence for the second doubling is also thinner than for the
first.

**The floor does not move with the target.** "You met the public-health
guideline" and "you met the goal you set" are different sentences. Collapsing
them meant that raising your sights erased the first, so the app punished
ambition with a permanently open ring.

**The exchange rate moving is deliberate, not an oversight.** The rate means "an
equal share of each side's week", so raising the cardio target really does make a
given run a smaller share of it. The visible consequence — the radar's cardio
line and past calendar days redrawing — is the honest one: those views answer
"how much of your current target was that", and that answer is supposed to change
when the target does. [0005](./0005-guideline-normalised-balance-index.md) is
amended accordingly.

## Rejected

**A single "intensity of ambition" slider** scaling both sides together. It
would move strength in the wrong direction for longevity and in no useful
direction for hypertrophy — exactly the conflation this change undoes.

**Making the guideline floor configurable too.** It is not a preference; it is
what the WHO says. A floor the user can move is not a floor.

**Leaving the exchange rate pinned to the old constants** so past shading never
changes. Tempting, and it would have made "an equal share of each side's week"
false for anyone who changed a target — a chart that quietly means something
different from the marker beside it is worse than one that redraws.

## Consequences

The default drawing scale shifts by about 1%: the guideline strength target is
now a readable 27 hard sets rather than the 27.27 that fell out of 60 ÷ 2.2, so
the exchange rate is 10.1 MET-min per effective set rather than exactly 10.
Imperceptible, and the price of a number the user can read and type.

Settings gains a section. `BalanceGradient` and the calendar now read the targets
off their payload rather than importing a constant, which also removes the
hardcoded `STRENGTH_TARGET = 60` that was sitting in the gradient as a second
copy of a number it only explained.
