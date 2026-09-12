# 22. The spacing score measures training distribution, and its target is attributed and configurable

**Status:** Accepted · 2026-09-12 · amends [0011](./0011-spacing-score.md)

## Context

0011 built the spacing score on an exposure it named directly:

> Breaking up sedentary time is a separate exposure with its own dose, and the
> app was silent about it.

The exposure is real. The **dose is not the one the app was scoring against.**

| Protocol | Interruption interval | Bout length | Interruptions/day |
| --- | --- | --- | --- |
| Dempsey 2016, *Diabetes Care* | every 30 min | 3 min | ~15–20 |
| Buffey 2022, *Sports Medicine* | every 20–30 min | 2 min (1 min was not enough) | ~20–25 |
| Dunstan 2012, *Diabetes Care* | every 20 min | 2 min | ~25 |
| **`TARGET_BOUTS = 5`** | **every ~2.8 h** | **not measured** | **5** |

An order of magnitude apart. And the gap cannot be closed by raising the number,
because most of those interruptions are standing up to make tea — a break the
app will never see, since its only evidence is logged training. 0011 also
conceded the point itself: *"`TARGET_BOUTS = 5` is a judgment call, not a
literature value."* It was presented in the header as a standard.

## Decision

**The score measures TRAINING DISTRIBUTION.** The module header now says so, and
names the sedentary-interruption dose as the thing it is *not*. What five bouts
is anchored to instead is the exercise-snacks literature this app's format
actually descends from: ~3 vigorous bouts a day in Jenkins 2019 and Islam 2022,
3–4 short vigorous bouts a day in Stamatakis 2022's VILPA work.

**The target is configurable** — `targetBouts`, 2 to 24, default 5 — the way the
active window already is. Someone who wants to chase the interruption dose can
set 20 and have the score, the merge window and the timing nudge all move with
them.

**The merge window moves with the target.** `mergeWindowFor` is 10% of the ideal
gap, clamped to 3–15 minutes, replacing the fixed `BOUT_MERGE_MIN = 15`. At the
default it lands on 14 minutes. It is derived from the *configured* window, not
the one an early run expanded, so a 05:30 start cannot widen what counts as one
bout.

**Bout length is reported, not scored.** `medianBoutMinutes` sits beside the
score with the count it was taken over. It is the `durationSec × sets` a bout's
entries actually recorded, summed — nothing inferred — and `null` when they
recorded none.

**The longest quiet stretch is promoted** from a clause in the subtitle to a
figure beside the score, with typical snack length next to it.

## Why

**Naming the exposure honestly costs nothing and fixes the claim.** The score
was always a good measure of training distribution. The only thing wrong with it
was the sentence above it.

**Configurable, because the two doses are both defensible.** The app cannot
observe the interruption dose, but a user who logs a two-minute walk every half
hour *is* generating that evidence, and the app should not tell them five is
enough. Making it a setting is the same answer 0019 gave for the weekly targets
and 0011 gave for the window.

**The merge window had to follow.** At a target of 20 the ideal gap is 40
minutes, and a fixed 15-minute merge would swallow a third of every genuine
break — quietly making the stricter target unreachable and the higher setting a
lie. 10% of the ideal gap keeps the anti-gaming property at every setting.

**Length reported, not filtered.** Buffey found 2 minutes effective where 1 was
not, so length plainly matters. But that threshold is about walking breaks for
glucose control, and this app was built to encourage a 20-second stair sprint.
Filtering those out of the score would be applying one literature's threshold to
another literature's exposure, and would contradict the app's own premise. The
number is shown so the user can see their typical snack is 20 seconds long, and
decide for themselves.

**Recorded time only, and `null` when there is none.** A set of ten push-ups
records no duration, so for a user who only lifts this figure reads "—" forever.
That is the true answer, and it is the answer the issue asked for: the app
cannot tell a 20-second interruption from a 5-minute one unless the entry says
so.

**Longest gap promoted** because prolonged unbroken sitting is what the
observational work implicates, and because "7h 40m" is something a person can
act on in a way "42%" is not.

## Rejected

**Raising the target to 20 and keeping the sedentary-interruption framing.** The
honest version of that app needs a way to log a non-training break — a "stood
up" button — and then it is a different app with a different logging burden. If
that is ever wanted, this change makes it a one-line default.

**A minimum bout duration before an entry counts.** The issue's first
suggestion. It would silently discard the 20-second stair sprints the app exists
to encourage, and it would discard them on evidence about walking. Worse, it
would apply unevenly by logging style: a set of ten push-ups records no duration
at all, so the filter would erase it while keeping a two-minute plank.

**Estimating a resistance set's duration from reps at a standard tempo**
(~3 s/rep, so ten reps is 30 seconds). Defensible, and the app does infer
elsewhere — METs from the Compendium, 1RM from Epley. But those inferences fill
in a value the user could not reasonably supply, whereas this one would put an
invented number under a label reading "typical snack", where it would be read as
a measurement. `null` is the true answer.

**Taking the span of a bout — first entry to last — as a second lower bound on
its length.** Written, then removed under review. Two things were wrong with it.
It is not a bound on *movement*: three sets logged between 18:00 and 18:05 is
about ninety seconds of work and three and a half minutes of standing about, so
reporting five beside the Buffey threshold — two minutes of actual walking —
overstates by the width of the rest intervals, which is the same species of
overclaim this ADR exists to fix. And because the merge window moves with
`targetBouts`, so did the span: the same six-entry circuit read as two
ten-minute bouts at a target of 5 and six untimed ones at 20, so a setting whose
copy promises only to change what a full mark is measured against silently
emptied an unrelated figure.

**Deriving the merge window from the expanded day.** Simpler — one window, used
everywhere — but it means an early run silently widens what counts as one bout,
so the same two evening entries merge on a day the user went for a dawn run and
do not on a day they did not.

## Consequences

`TARGET_BOUTS` is gone, replaced by `DEFAULT_TARGET_BOUTS`; nothing outside
tests referenced it.

**Historical scores move slightly.** The merge window goes from 15 minutes to 14
at the default, so two entries exactly 15 minutes apart are now two bouts rather
than one. That raises a small number of past days. No migration: the score is
derived at read time, as it always was.

**"Typical snack" will read "—" for a user who only logs sets and reps.** That
is the honest state, and the card says which kinds of entry carry a duration
rather than leaving a bare dash.

The stats card gains two figures and loses the sentence that asserted "every
couple of hours" and "a quarter of an hour" as facts — both now read from the
user's own settings.

Most people will never open the new setting, which is the intent. It exists so
that the default can be a default rather than an assertion.
