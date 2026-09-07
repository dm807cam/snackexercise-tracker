# 13. One colour, one quality — and `--accent` is not one of them

**Status:** Accepted · 2026-09-07

## Context

Cardio joining the radar ([0010](./0010-cardio-is-a-second-radar-series.md)) put
blue and orange on a chart and gave them meanings: strength and cardio. That
exposed a collision the app had lived with quietly. `--accent` and `--cardio`
are the *same orange* — deliberately, so the cardio end of the balance gradient
stays continuous with the app's identity — and `--accent` was also being used
for quantities:

- the body map filled trained muscles in `--accent` and outlined cardio in
  `--cardio`, so the resistance fill and the aerobic outline were **the same
  colour** and the figure could not say which quality had loaded a muscle;
- the calendar washed each day in `--accent` for a dose that is strength *and*
  cardio added together, which reads as a claim about cardio;
- the per-axis trend arrow on the stats list was `--accent`, sitting inches from
  a genuine cardio figure in the same orange.

## Decision

Colours are split by job, and the split is written at the top of the token block
in `app/globals.css`:

| Token | Means |
| --- | --- |
| `--accent` | **interaction** — buttons, the log FAB, the active nav tab, a selected chip, a link. Never a quantity. |
| `--strength` | resistance work, everywhere, and only that |
| `--cardio` | aerobic work, everywhere, and only that |
| `--timing` | when in the day it happened |

So: the body map fills in `--strength` and outlines in `--cardio`; the radar
draws one line in each; the calendar washes a day in `--strength` and rings it
in `--cardio`; the balance bar runs from one to the other; the spacing chart is
`--timing` throughout. Today's calendar ring moved from `--accent` to `--text`,
because a cell now uses orange to mean something.

Every one of those marks is also named in words — a legend under the body map
and the calendar, keys under the radar, a dot beside each row of "needs
attention", and both figures in each calendar cell's `aria-label`. **Colour is
never the only carrier.**

## Why

The rule is the cheap version of the real requirement, which is that a reader
should be able to learn two colours once and then read every chart in the app.
That fails the moment a colour means "cardio" in one place and "a thing you can
tap" in another.

`--accent` and `--cardio` were left identical rather than pulled apart. The
warm accent is the app's identity and the balance gradient's cardio end is
pinned to it on purpose; changing either would be a bigger, worse change than
the problem. Chrome and data are distinguishable by what they are — a filled
round button with a `+` in it is not an anatomical outline — provided nothing
data-shaped ever wears the accent. That proviso is the whole decision.

`--timing` is a third hue rather than a shade of either, because "when in the
day" is a third quality. Its separation from both was checked with a
colour-blindness validator rather than eyeballed; it never has to be told apart
from them inside one chart, since spacing is always the only series on its own.

## Rejected

**Re-hueing `--accent` so cardio owns the orange alone.** Repaints the whole app
to fix a collision that a usage rule fixes.

**Blending the two on the calendar** (a purple-ish wash for a mixed day). The
same objection as everywhere else in this codebase: the two currencies are
never added, and a blended colour would be a claim that they had been.

## Consequences

`getDailyLoad` returns `{ strength, cardio, total }` per day instead of a single
combined number, so the calendar can colour the two separately. `total` is
exactly the number it used to return, and streaks, active days and month totals
still count it — a day of running is a day you trained.

Adding a colour to this app now means answering "which quality is it?" first. If
the answer is "none, it's a control", it is `--accent` and it does not go on a
chart.
