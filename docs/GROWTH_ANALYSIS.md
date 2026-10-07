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

## Metric meanings

| Metric | Meaning |
| --- | --- |
| Current weight | Newest effective, non-deleted measurement |
| Previous weight | Effective measurement immediately before the current one |
| Difference | Current weight minus previous weight; this is not normalized for time |
| Growth since birth | Percentage change from recorded birth weight to current weight |
| Growth per 24 hours | Change normalized to 24 hours from the closest suitable earlier sample; intervals shorter than six hours are not extrapolated |
| Last weighed | Timestamp of the newest effective measurement |
| Litter position | Weight rank and percentage difference from the current litter median |

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

For a reached milestone, Puppy Tracker stores the first effective measurement
at or above the target. For the next milestone it estimates a date and range
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
Tracker -> Configure -> Settings**. They include minimum daily growth, maximum
hours between weighings and the number of puppy-age days during which growth is
actively checked.

To override growth context for one litter, open **Configure -> Manage litter**
and edit that litter. Available fields include:

- breed profile and size class;
- minimum daily growth percentage;
- maximum hours between weighings;
- growth-monitoring age in days;
- first-day maximum weight loss percentage;
- expected adult-weight minimum and maximum;
- number of recent intervals used for milestone projection.

An empty per-litter threshold uses the integration-wide fallback. Changes
affect derived status and projections; they do not rewrite measurements.

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
Available initial metrics are `weight`, `growth24` and `growthBirth`.
Every puppy series and every subgraph use the configured collar colour. The
milestone annotations appear only on weight charts.

Keep `show_advanced_analysis: false` for a concise operational view. Enable it
when cadence, variability, litter comparisons and projection confidence are
useful during a review.

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
