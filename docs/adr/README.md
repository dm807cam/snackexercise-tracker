# Architecture decision records

One file per decision that would otherwise be re-argued every six months.

Each records the decision, what was actually at stake, what was rejected and
why, and — where a decision is a judgment call rather than a derivation — says
so plainly, so that a future reader can overturn it on purpose rather than by
accident.

| | Decision | Status |
| --- | --- | --- |
| [0001](./0001-cardio-rides-on-setentry.md) | Cardio is a `SetEntry`, not a new table | Accepted |
| [0002](./0002-cardio-bias-is-continuous.md) | `cardioBias` is a float, not a modality enum | Accepted |
| [0003](./0003-steps-are-a-daily-metric.md) | Steps get their own table, keyed on `localDate` | Accepted |
| [0004](./0004-met-minutes-as-the-cardio-currency.md) | Cardio is scored in MET-minutes | Accepted |
| [0005](./0005-guideline-normalised-balance-index.md) | The balance marker normalises each side by its own guideline | Accepted, amended by 0016, 0019 |
| [0006](./0006-beta-prior-and-uncertainty-band.md) | A Beta prior supplies both the marker and its band | Accepted |
| [0007](./0007-steps-are-discounted-and-personally-baselined.md) | Steps count at half weight above a personal baseline | Accepted, contested, amended by 0021 |
| [0008](./0008-cardio-stays-off-the-radar.md) | Cardio contributes no effective sets | Accepted |
| [0009](./0009-active-days-ignores-steps.md) | `activeDays` stays "days with entries" | Accepted, contested |
| [0010](./0010-cardio-is-a-second-radar-series.md) | Cardio gets a second radar series, not a share of the first | Accepted |
| [0011](./0011-spacing-score.md) | Spacing is scored by gap concentration against a target frequency | Accepted, amended by 0022 |
| [0012](./0012-times-are-typed-not-stamped.md) | A typed time beats an instant built in the browser | Accepted |
| [0013](./0013-one-colour-one-quality.md) | One colour, one quality — and `--accent` is not one of them | Accepted |
| [0014](./0014-a-daily-share-with-no-carry-over.md) | Today's target is a flat seventh, and nothing carries over | Accepted, amended by 0016, 0021 |
| [0015](./0015-effort-scales-effective-sets.md) | Effort scales effective sets; an unrated set counts as a hard one | Accepted |
| [0016](./0016-the-scalar-dose-is-hard-sets.md) | The scalar strength dose is hard sets, not summed effective sets | Accepted, amends 0005 |
| [0017](./0017-the-radar-is-read-against-an-absolute-target.md) | Volume is read against an absolute per-muscle target, not the user's best spoke | Accepted |
| [0018](./0018-progression-is-a-per-movement-best-set.md) | Progression is a per-movement best set; a stall is weeks without one moving | Accepted |
| [0019](./0019-targets-are-configurable-and-the-two-claims-are-separate.md) | The weekly targets are configurable, and the two claims are kept apart | Accepted, amends 0005 |
| [0020](./0020-intensity-is-classified-on-the-users-own-scale.md) | Intensity is classified on the user's own scale, and reported beside volume | Accepted |
| [0021](./0021-walking-cannot-close-the-cardio-ring.md) | Walking fills at most half the cardio ring, and a daily step total is not brisk | Accepted, amends 0007, 0014 |
| [0022](./0022-the-spacing-target-is-attributed-and-configurable.md) | The spacing score measures training distribution, and its target is attributed and configurable | Accepted, amends 0011 |

## Format

Short. If an ADR takes more than a screen, the decision was probably two
decisions.
