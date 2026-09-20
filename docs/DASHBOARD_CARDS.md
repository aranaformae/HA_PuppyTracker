# Dashboard cards

Puppy Tracker registers its Lovelace cards automatically. Add a card with the
visual dashboard editor or use its YAML type directly. Restart Home Assistant
and fully refresh the browser or Companion App after an integration update.

## Card overview

| Card | Type | Purpose |
| --- | --- | --- |
| Weighing Station | `custom:puppy-tracker-card` | Record weights and run a complete litter weighing session |
| Growth Overview | `custom:puppy-tracker-overview-card` | Compare weight, growth and milestones |
| Summary | `custom:puppy-tracker-summary-card` | Compact status with optional navigation |
| Today | `custom:puppy-tracker-today-card` | Today's weighing progress and care activity |
| Attention | `custom:puppy-tracker-attention-card` | Weight, dossier, reminder and care alerts |
| Litter | `custom:puppy-tracker-litter-card` | Sortable per-puppy overview |
| Report | `custom:puppy-tracker-report-card` | PDF, CSV and JSON export |
| Owners | `custom:puppy-tracker-owner-card` | Contact records and puppy links |
| Dossier | `custom:puppy-tracker-dossier-card` | Dossier records and follow-up actions |
| Quick Log | `custom:puppy-tracker-quick-log-card` | Fast structured logging |
| Mobile Controls | `custom:puppy-tracker-mobile-card` | Weighing, Quick Log, Today and Care today tabs |
| Bulk Dossier | `custom:puppy-tracker-bulk-dossier-card` | One record for several puppies |
| Timeline | `custom:puppy-tracker-timeline-card` | Combined weight and dossier chronology |
| Recurring Reminders | `custom:puppy-tracker-recurring-reminder-card` | Generic repeating/fixed/one-time actions |
| Care Programs | `custom:puppy-tracker-care-program-card` | Age-based programs and templates |
| Care Execution | `custom:puppy-tracker-care-execution-card` | Complete open care actions by scheduled day |
| Temperature | `custom:puppy-tracker-temperature-card` | Temperature entry, latest value, chart and history |

## Common options

Several cards accept `title`, `litter_id` and `show_litter_selector`. `litter_id`
is useful for a dashboard dedicated to one litter; hiding the selector only
makes sense when the card cannot accidentally open another litter.

The Dossier, Timeline, Temperature and Quick Log cards support
`default_selected`. Supported values depend on whether a card can safely show
or create aggregate data:

| Value | Meaning |
| --- | --- |
| `all` | Aggregate litter, mother and puppy history; Dossier and Timeline only |
| `litter` | Whole-litter owner |
| `mother` | Linked mother-dog owner |
| `puppy` | Puppy selected by `puppy_id`, or the first available puppy |

`default_scope` remains accepted as a backwards-compatible alias on cards that
previously used it. Prefer `default_selected` in new dashboard YAML.

## Recommended layouts

For a phone, start with one Mobile Controls card and add focused Temperature or
Attention cards only when needed:

```yaml
type: custom:puppy-tracker-mobile-card
title: Puppy Tracker
show_weighing: true
show_quick_log: true
show_today: true
show_care_today: true
show_today_only: true
default_selected: litter
```

For a tablet, a practical split is:

1. **Home:** Summary, Today and Attention.
2. **Weighing:** Weighing Station and Growth Overview.
3. **Care:** Care Execution, Quick Log, Temperature and Dossier.
4. **Management:** Care Programs, Recurring Reminders, Owners and Report.

This avoids duplicating every card on one long dashboard.

## Card-specific options

### Weighing Station

```yaml
type: custom:puppy-tracker-card
title: Puppy weegstation
show_puppies: true
show_details: true
```

`show_details` controls the pre-save comparison with the previous weight, the
difference, last weighing time and elapsed time. The selected puppy's collar
colour is also visible before saving.

### Growth Overview

```yaml
type: custom:puppy-tracker-overview-card
default_range: 7d
default_metric: weight
show_summary: true
show_puppy_cards: true
show_advanced_analysis: false
show_growth_milestones: true
show_milestone_chart_annotations: true
```

`default_metric` accepts `weight`, `growth24` or `growthBirth`. Every chart
series uses the puppy's collar colour. Advanced analysis can be hidden without
changing calculations or stored data.

### Today and Attention

```yaml
type: custom:puppy-tracker-attention-card
show_today_only: true
max_items: 25
compact: false
navigate_path: /lovelace/puppies-care
```

Both cards include category chips; clearing every chip intentionally shows no
matching items. `show_today_only` limits care items to occurrences scheduled for
the current local date; future and older overdue occurrences are hidden.
Attention's list scrolls within the card at `60vh`; Today's combined activity
list scrolls at 520 px.

### Litter and Summary

The Litter card accepts `active_only`, `show_details` and `default_sort`.
`default_sort` accepts `name`, `weight`, `growth24`, `last` or `attention`.
Setting `show_details: false` uses the compact row layout.

The Summary card accepts `navigate_path` to make the compact summary open a
larger Puppy Tracker dashboard.

### Dossier

```yaml
type: custom:puppy-tracker-dossier-card
default_selected: all
show_profile_note: true
show_timeline_items: false
```

The timeline starts collapsed when `show_timeline_items` is `false`, but the
large show/hide button remains available and displays the number of matching
items. The record list scrolls after 520 px. Existing items remain manageable
in the `all` view because their original owner is preserved. Select a specific
owner before adding a new item.

### Quick Log

```yaml
type: custom:puppy-tracker-quick-log-card
default_selected: mother
show_litter_selector: true
```

Quick Log accepts `litter`, `mother` or `puppy`. Configure `puppy_id` when a
specific puppy should open by default. It never accepts `all`, because a new
record must have one exact owner.

### Mobile Controls

`show_weighing`, `show_quick_log`, `show_today` and `show_care_today` control
the four tabs. `tab` can initially select `weighing`, `quickLog`, `today` or
`care`. `show_today_only` is passed to the Today tab. `default_selected` and
`puppy_id` control the Quick Log starting owner.

The card reuses the full weighing and care-result workflows. Completing a care
item opens the same result/note dialog as the dedicated care surfaces.

### Timeline

```yaml
type: custom:puppy-tracker-timeline-card
default_selected: all
max_items: 250
show_history_toggle: true
show_timeline_items: false
```

The card combines effective weight measurements and dossier history. Category
filters are presentation-only and do not change records.

### Care Programs

The management card supports `show_disabled`, `max_items`, `compact` and
`sort_order` (`schedule` or `title`). Its program list scrolls internally at
`60vh`. See [Age-based care programs](CARE_PROGRAMS.md) for program and template
details.

### Care Execution

```yaml
type: custom:puppy-tracker-care-execution-card
show_day_selector: true
days_ahead: 14
max_items: 50
```

This checklist includes open occurrences regardless of whether a program
counts for Attention. With the day selector enabled, previous/next buttons and
a date selector show one scheduled day. `days_ahead: 0` loads today and overdue
actions only. The action list scrolls internally at `60vh`.

### Temperature

The Temperature card can independently show or hide selectors, latest value,
chart, threshold lines, history and entry controls. See the complete
[Temperature card reference](temperature-card.md).

### Report

`default_range` accepts `24h`, `3d`, `7d`, `14d`, `30d` or `all`.
`default_profile` accepts `full`, `handover` or `internal`. The report UI then
allows individual PDF sections to be included or excluded.

### Bulk Dossier, reminders and owners

Bulk Dossier accepts `active_only` and remains puppy-oriented. Recurring
Reminders accepts the standard title/litter selector options. The Owners card
accepts an optional `title`; its create/edit form starts collapsed, clicking an
owner expands all stored details, and puppy linking remains a separate step.
