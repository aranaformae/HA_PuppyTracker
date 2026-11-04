# Weighing and growth analysis

Puppy Tracker keeps weight measurements as a versioned time series. The
**Weigh** tab is for fast data entry; the **Analysis** tab explains the current
and historical pattern. Both are available in the Growth Workspace, while the
Mobile Workspace includes the same weighing workflow.

Puppy Tracker is a registration and monitoring aid. Growth thresholds,
comparisons and projections are not diagnoses and do not replace veterinary
assessment.

## Weighing workflow

1. Open a Workspace with `preset: growth` or `preset: mobile`.
2. Select the litter and puppy.
3. Check the collar-colour marker and the last recorded weight.
4. Enter the new weight in grams.
5. Review the difference from the previous measurement and elapsed time before
   saving.
6. Save the measurement, or use a weighing session to work through every
   active puppy in sequence.

The weighing surface shows the weight that is about to be saved, the previous
effective measurement, the difference and when the puppy was last weighed.
Duplicate protection asks for confirmation when a near-identical measurement
is entered shortly after the previous one.

Corrections never overwrite history. Editing a measurement creates a new
effective version and preserves the corrected version in the audit chain.
Delete and restore use the same non-destructive model.

An active weighing session is saved with each measurement and survives an
integration reload or Home Assistant restart. After interruption it must be
explicitly resumed or closed; saved weights are never entered again and an
unfinished input is not restored. Closing the session keeps all saved weights.
The native Start session button resumes a pending session; Reset closes it.
Session recovery is local to this installation, not included in JSON transfers.
The ordinary and Mobile Weigh tabs show an inline **Resume / Close session**
choice with saved progress after interruption. Closing asks for confirmation;
weight entry stays disabled until the choice is resolved. Dashboard recovery
actions require an administrator, and stale choices cannot change a newer session.

After saving, administrators can **Undo** the last station weighing for two
minutes. The action names the saved puppy (including its collar colour) and
weight, not the puppy selected after automatic advance. It soft-deletes that
exact new measurement, restores the previous session progress and returns to
that puppy. Undoing the final puppy reopens the session and restores the earlier
completed-session summary; undoing a reweigh keeps its earlier session weighing.
An unsaved input needs confirmation before it is cleared.

Only the latest save has this shortcut. A new save, reset or restart invalidates
the old action. Changed, corrected, deleted or expired measurements cannot be
undone through it; use normal measurement editing/history instead. After expiry
the button stays disabled rather than shrinking the card while you work. No
measurement history is permanently removed. Supported tagged completion
notifications are withdrawn when the session reopens.

## Metric meanings

| Metric | Meaning |
| --- | --- |
| Current weight | Newest effective, non-deleted measurement |
| Previous weight | Effective measurement immediately before the current one |
| Difference | Current weight minus previous weight; this is not normalized for time |
| Growth since birth | Percentage change from recorded birth weight to current weight |
| Growth per 24 hours | Change normalized to 24 hours from the closest suitable earlier sample; intervals shorter than six hours are not extrapolated |
| Last weighed | Timestamp of the newest effective measurement |
| Litter comparison | Weight as a percentage of the other puppies' median at the same age |

The trend labels describe the **rate of growth**, not whether the puppy became
lighter. For example, **Growth slows** can still accompany a higher current
weight when the puppy gained fewer grams per day than during earlier intervals.
Actual loss is reported separately as weight loss.

## Monitoring status

Monitoring combines the current measurement, puppy age and effective litter
settings. Important states include:

- no measurement or a weighing that is overdue;
- first 24 hours, with a separate configurable first-day loss boundary;
- current weight below the previous measurement;
- normalized daily growth below the configured threshold during the monitoring
  age window;
- repeated loss or repeated low-growth samples;
- a large isolated change that should be checked as a possible input or scale
  issue.

A status is a prompt to review the measurement and puppy, not a medical
conclusion. The Attention view and notifications consume the same canonical
status as the Growth view and puppy entities.

## Milestones and projections

The Analysis tab tracks birth-weight milestones. The current defaults are:

- `200%`: twice the birth weight;
- `400%`: four times the birth weight.

For a reached milestone, Puppy Tracker identifies the first effective measurement
at or above the target. Milestone state is derived from the effective history,
so correcting or deleting a measurement recalculates it rather than leaving a
separate saved milestone behind. For the next milestone it estimates a date and range
from recent valid growth intervals. The configured projection sample count is
between 2 and 8 measurements and defaults to 4.

Projection confidence reflects sample count, spread and weighing cadence. An
irregular cadence or changing growth rate widens uncertainty. The traditional
two-week birth-weight-doubling reference is shown as an easy monitoring aid;
it is not a breed-independent guarantee or clinical rule.

Breed profile (`labradoodle` or `australian_labradoodle`), size class and the
optional expected adult-weight range are descriptive context. They do not
silently replace the configured monitoring thresholds with breed rules.

## Configure thresholds per litter

Global fallback thresholds are under **Settings -> Devices & services -> Puppy
Tracker -> Configure -> Growth and notifications -> Default growth thresholds**. They include minimum daily growth, maximum
hours between weighings and the number of puppy-age days during which growth is
actively checked.

To override growth context for one litter, open **Configure -> Nests and puppies ->
Edit litter details -> Growth analysis for this litter**. Available fields include:

- breed profile and size class;
- minimum daily growth percentage;
- maximum hours between weighings (in the separate **Weighing schedule** section);
- growth-monitoring age in days;
- first-day maximum weight loss percentage;
- expected adult-weight minimum and maximum;
- birth-weight milestone percentages and the reference age for doubling;
- number of recent measurements used for milestone projection.

An empty per-litter threshold uses the integration-wide fallback. Changes
affect derived status and projections; they do not rewrite measurements.
Existing values are prefilled and can be cleared. Empty milestone fields use
200% and 400%, a 14-day doubling reference and four recent growth intervals.
Litter and parent changes are saved when you submit the form.

## Growth Workspace configuration

```yaml
type: custom:puppy-tracker-workspace-card
preset: growth
default_tab: weighing
tab_config:
  weighing:
    show_puppies: true
    show_details: true
  analysis:
    default_range: 7d
    default_metric: weight
    show_summary: true
    show_puppy_cards: true
    show_advanced_analysis: false
    show_growth_milestones: true
    show_milestone_chart_annotations: true
```

The Analysis period accepts `24h`, `3d`, `7d`, `14d`, `30d` or `all`.
Available initial metrics are `weight`, `growth24`, `growth48`, `growth72`,
`weightAverage48` and `growthBirth`.
Every puppy series and every subgraph use the configured collar colour. The
milestone annotations appear only on weight charts.

Keep `show_advanced_analysis: false` for a concise operational view. Enable it
when cadence, variability and projection confidence are useful during a review.
The separately configurable litter comparison does not require advanced mode.

## Rolling windows and input checks

`growth48` and `growth72` plot percentage change over the full preceding 48 or
72 hours, ending at each effective measurement. They are not normalized daily
percentages and do not replace the existing `growth24` monitoring calculation.
If no measurement exists at the window start, the backend linearly interpolates
between surrounding measurements. A complete time window is required: shorter
histories produce no point, and no extrapolation is performed. Large gaps still
limit the evidence; interpolation is an estimate, not an observed measurement.

`weightAverage48` is an optional chart mode showing the time-weighted mean
weight over the preceding 48 hours. It integrates the linear curve between
measurements, so adding samples on the same curve does not change the result.
Neither rolling growth nor the average changes attention thresholds, diagnoses
or saved measurement values. All modes retain puppy collar colours.

Before saving through the shared Weighing surface, a read-only backend preflight
uses the same sudden-change rule as stored growth analysis: a change of at least
25% from the preceding weight, with at least two prior effective measurements.
Normal weights save immediately; a flagged value requires pressing Save weight
again. Changing the value or puppy clears confirmation; a changed baseline
measurement also requires a fresh confirmation. Failed preflight writes nothing
and retains the entered value. Selection and save controls are locked during
preflight/save. This is an input-review prompt, not a medical conclusion.
Direct Home Assistant record-weight actions retain their existing behavior.

## Estimated weight at eight weeks

The selected puppy details can show an indicative weight at birth time plus
56 days. Set `tab_config.analysis.show_eight_week_weight: false` to hide it;
the Growth Workspace visual editor exposes the same option.

The backend fits the elapsed-time-weighted linear trend of the latest 14 days,
not only the last few readings. At least four distinct measured instants and
seven days of coverage are required. If needed, the window-start weight is
interpolated from surrounding measurements. Extra samples on an unchanged
piecewise-linear curve do not distort the trend. The projection continues this
absolute grams/day slope from the latest effective weight to eight weeks.

The displayed range reflects variation in the measured growth rates; it is
not a statistical prediction interval or a breed-specific healthy-weight
range. Longer forecast horizons are especially uncertain, and future growth
can change. Missing birth time, insufficient coverage or a nonpositive fitted
trend produces **Insufficient data**. After eight weeks the forecast is hidden,
rather than presenting an old prediction as a measured weight. This is an
Analysis-card estimate, not an attention rule or an adult-weight prediction.

## Data quality tips

- Weigh under comparable conditions and record the real measurement time.
- Correct a wrong value instead of adding an opposite value to compensate.
- Use birth time and birth weight when age-based monitoring and milestones are
  needed.
- Treat a stale or missing weight as missing evidence; do not infer a trend.
- Review an unexpected jump against the scale, unit and selected puppy before
  acting on the derived analysis.

CSV exports contain effective measurements for external analysis. PDF reports
can include the selected period's chart and measurement table. JSON backups
retain the complete measurement and correction history.

## Age-based weighing schedule

Open **Settings -> Devices & services -> Puppy Tracker -> Configure -> Nests and
puppies -> Edit litter details -> Weighing schedule**. Enable the age-based
schedule for that litter. Existing litters keep their fixed interval until you
enable it; the integration-wide interval remains the fallback.

The prefilled personal breeder workflow has four editable phases:

| Puppy age | Maximum time since last weighing |
| --- | --- |
| Birth to less than 10 days | 12 hours |
| 10 days to less than 28 days (4 weeks) | 24 hours |
| 28 days to less than 42 days (6 weeks) | 48 hours |
| 42 days to less than 52.5 days (7.5 weeks) | 72 hours |
| From 52.5 days | No planned weighing alerts |

Each end age and interval is editable per litter. End ages must increase, up to
56 days, and intervals must be between 1 and 168 hours. Half-day end ages are
supported. Disabling the schedule retains its phase values for later use and
restores the litter-specific fixed interval, or the global fallback if empty.

Age is elapsed time from each puppy's birth timestamp; DST does not add or
remove an age hour. The interval for the puppy's current phase is measured
from its last effective weighing. Twice daily therefore means a 12-hour
interval, not two fixed clock-time appointments. Without a usable birth time,
fixed-interval monitoring remains active.

The last phase ends automatic **weighing due** and **missing weighing** alerts,
including their counts, notifications and automation transitions. You can still
weigh manually, and actual weight loss or applicable low-growth concerns remain
visible. The separate growth-monitoring age window is unchanged.

Cards using shared status details show the active interval or that no further
weighings are planned. The native puppy Status entity also exposes the current
mode, phase, interval and finished flag as attributes. The schedule is stored
with the litter and included in full/litter backups and transfers; historical
measurements are never rewritten. These prefilled phases are a configurable
personal workflow, not a universal veterinary or breed-specific recommendation.

## Compare littermates and earlier litters

In **Growth → Analysis**, select a puppy. **Littermate comparison** initially
shows just its relative weight and, when available, its change over a week.
Open **Compare nest period and earlier litters** for a collar-colour chart and
optional **View weekly figures** and **Calculation and data quality** sections
covering birth through day 56. This overview uses the complete
nest period independently of the main chart's selected date range.

`100%` means the median weight of the **other** puppies at that same age.
For example, `90%` means 10% lighter than those littermates; it is not a health
score. Each puppy has its own elapsed-age axis, including when birth times
within the litter differ. Inactive or placed puppies remain part of their nest
history rather than silently disappearing from the comparison.

The weekly table contains:

- relative weight: `puppy weight / median other puppies' weights × 100`;
- change in relative position versus seven days earlier, in percentage points;
  this stays empty if the group of comparable littermates has changed;
- growth rate: the puppy's seven-day gram gain per day divided by the median
  corresponding rate of other puppies, times 100; no ratio is shown when the
  reference growth is zero or negative;
- birth-weight factor: `weight / recorded birth weight`;
- median and arithmetic mean weight of the other puppies, plus their count.

A lower relative weight can remain stable while the puppy grows normally.
A declining relative position means it is becoming lighter **relative to those
littermates**, even if its own weight increased. There are no new attention
thresholds or automatic health labels attached to these comparisons.

### A personal reference for later nests

Choose **Earlier own litters** inside the expanded section. Historical data is
only requested at this point. Filter by all earlier litters, the same registered
mother, or the same configured size class. Missing mother IDs and unknown size
classes do not count as a match. The current litter and litters with the same or
later first birth time are excluded; archived litters remain available.

For every age day, calculate each earlier puppy's birth-weight factor, then
its litter's median factor. At least two puppies with usable birth weights and
weights at that age are required for a historical litter to contribute. The
personal reference is the median of these **litter medians**, so a large litter
or a puppy weighed frequently does not dominate it.

The historical graph shows the selected puppy's birth-weight factor against
the personal reference. A weekly table shows the factors, percentage of the
reference and contributing litter/puppy counts. With fewer than five eligible
historical litters, their individual curves remain visible. At an age with at
least five contributing litters, a band shows the 25th–75th percentiles of the
litter medians. This is descriptive spread, not a prediction interval or a
healthy-weight range. Breed, sex and parent size are not automatically corrected
for; the filters and sample counts provide context, not statistical guarantees.

### Missing data and display settings

Only effective, positive, non-future weights are used. Recorded birth weight
provides day zero. Between measurements at most 72 elapsed hours apart, linear
interpolation supplies a daily-age point. Interpolated table values are marked
with `*`; larger gaps stay empty and break chart lines. No extrapolation is used,
including at day 56. The compact summary names the last comparable age day,
which may precede the latest weighing. A missing birth weight prevents normalized
historical comparison but does not prevent an ordinary littermate comparison.

The expansion, selected comparison and filter survive normal card refreshes.
Lists/tables scroll inside bounded regions on narrow screens. The new section
replaces the older separate nest-position/tempo boxes in Analysis's advanced
panel to avoid two different comparisons. Existing monitoring metrics and
notifications are unchanged.

To hide the entire new section, use the Growth visual editor or:

```yaml
tab_config:
  analysis:
    show_litter_comparison: false
```

It defaults to `true`, independently of `show_advanced_analysis`. This analysis
is currently an interactive Growth view; it does not add a new PDF chapter or
change stored measurements, exports or backups.
