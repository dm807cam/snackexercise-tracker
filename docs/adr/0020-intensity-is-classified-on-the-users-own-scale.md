# 20. Intensity is classified, on the user's own scale, and reported beside volume

**Status:** Accepted · 2026-09-11

## Context

MET-minutes are a pure volume currency: intensity × duration, collapsed into one
product. By construction 150 min at 4 METs and 37.5 min at 16 METs are the same
600 MET-min — same point on the balance marker, same ring closed, same calendar
shading. `grep -i vigorous lib/` returned a comment.

That is exactly where MET-minutes stop being a valid instrument for the goal the
app states:

- **Cardiorespiratory fitness is the dominant predictor, not volume.** Mandsager
  et al. 2018, *JAMA Netw Open* (122,007 treadmill-tested): the adjusted
  mortality gradient across CRF quintiles exceeds that of smoking, diabetes or
  hypertension, with no observed upper limit. CRF responds to intensity far more
  than to accumulated low-intensity minutes.
- **The vigorous fraction carries independent benefit.** Wang et al. 2021, *JAMA
  Intern Med* (403,681 adults): at *matched* total volume, a higher proportion of
  vigorous activity was associated with lower all-cause mortality.
- **Very short vigorous bouts count**, which is this app's own format.
  Stamatakis et al. 2022, *Nature Medicine*: 3–4 bouts of ~1–2 minutes of
  vigorous incidental activity a day, associated with substantially lower
  all-cause and cardiovascular mortality in non-exercisers.

A user doing four stair-sprints a day was scored at ~40 MET-min and an open ring.

**The blocking problem was that the app could not classify intensity at all.**
`heartRateFactor` anchored on a fixed 150 bpm — "typical" for everyone. For a
25-year-old (HRmax ≈ 190 by Tanaka) that is ~79%; for a 60-year-old (≈ 166) it
is ~90%. Same factor of 1.0 for both.

## Decision

**Two numbers in Settings: `birthYear` and `restingHr`**, both optional.

**A personal heart-rate scale** (`lib/intensity.ts`): %HRR (Karvonen) when a
resting rate is known, %HRmax (Tanaka, 208 − 0.7 × age) when only age is,
**falling back to the existing fixed anchor when neither is set**. The clamp
(0.6–1.6) is kept.

**Every entry is classified** light / moderate / vigorous on ACSM's bands —
≥77% HRmax, ≥60% HRR, or ≥6 METs — with a measured heart rate preferred to the
movement's nominal cost.

**Vigorous is a second cardio series**, never added to the total: vigorous
minutes against the WHO's 75 min/wk, vigorous MET-minutes, and **vigorous bouts**
alongside. "Needs attention" gains a row for days since the last vigorous effort.

## Why

**Tanaka, not 220 − age.** The familiar formula was never derived from data and
under-predicts for older adults by around ten beats — the direction that matters,
since under-predicting HRmax makes every effort look harder than it was.

**Karvonen when it can.** Two people at 130 bpm are not working equally hard if
one sits at 45 and the other at 75, and %HRmax cannot see that.

**The fixed anchor survives, and that is the point.** Returning `null` rather
than a factor when the app has no age means entering one *improves* the estimate
instead of silently restating every heart rate logged before. Nobody's history
changes because a feature shipped.

**Bouts as well as minutes.** The VILPA finding is stated in bouts, and a
minutes-based target rounds this app's whole format away: four stair-sprints is
about four minutes, which against 75 min/wk looks like nothing.

**A heart rate beats a MET table.** A "vigorous" movement performed gently is not
vigorous, and only the measured rate can say so. Without an age the app has no
personal scale, so METs decide — which is what it always did.

**Strength work is excluded from the vigorous count.** `cardioBias` scales a
lift's MET-minutes to zero, so a heavy set of squats would otherwise be reported
as vigorous cardio on the strength of its heart rate alone.

## Rejected

**Asking for a measured HRmax.** More accurate and almost nobody has one; a
field most users leave blank is a field that does nothing.

**Folding vigorous minutes into the cardio total** with a multiplier. It would
make the total mean something new, and it is precisely the collapsing of
intensity into volume that this ADR exists to undo — two qualities, never summed,
the same rule the app already applies to strength and cardio.

**Classifying by METs alone** and skipping the physiology entirely. Cheaper, and
it would keep the app unable to tell an easy jog from an interval session, which
is the distinction the evidence turns on.

## Consequences

A user who enters nothing sees exactly what they saw before, plus a stats section
telling them what the two numbers would buy. A user who enters a birth year gets
every MET figure on every page re-read on their own scale — day view, calendar
and stats share one context per request, so they cannot disagree.

The intensity context is anchored on the day being viewed for the day page and on
the end of the range for the calendar, so a month of shading is read on one scale
rather than shifting mid-grid on a birthday.
