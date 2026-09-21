# Dashboard cards

Puppy Tracker 0.25.0 uses one task-focused Workspace card instead of separate
cards for every feature. Owners and Report remain separate because they are
distinct management workflows. The integration registers all three cards
automatically.

## Public cards

| Card | Type | Purpose |
| --- | --- | --- |
| Workspace | `custom:puppy-tracker-workspace-card` | Daily use through Home, Growth, Journal, Care or Mobile presets |
| Owners | `custom:puppy-tracker-owner-card` | Contact, placement, payment and puppy-link management |
| Report | `custom:puppy-tracker-report-card` | PDF, CSV and JSON export |

## Workspace presets

Choose a preset in the visual editor or YAML. Each preset loads only its own
surfaces and remembers the last active tab. Only the visible tab is attached
and subscribed; inactive tabs keep their local element state but do no
background work. This reduces updates and avoids unnecessary dashboard
movement.

| Preset | Tabs | Use |
| --- | --- | --- |
| `home` | Today, Attention, Puppies | Current status and exceptions; includes Summary by default |
| `growth` | Weigh, Analysis | Weighing sessions, collar-colour charts and growth analysis |
| `journal` | Quick log, Dossier, Timeline, Temperature | All observation and dossier workflows |
| `care` | Execute, Programs, Reminders | Complete and manage scheduled care |
| `mobile` | Weigh, Quick log, Today, Execute | Touch-first daily workflow without leaving the card |

Basic examples:

```yaml
type: custom:puppy-tracker-workspace-card
preset: home
title: Puppy Tracker
```

```yaml
type: custom:puppy-tracker-workspace-card
preset: mobile
show_today_only: true
default_selected: litter
```

## Workspace options

| Setting | Values | Purpose |
| --- | --- | --- |
| `preset` | `home`, `growth`, `journal`, `care`, `mobile` | Selects the workflow and available tabs |
| `title` | text | Adds an optional heading above the Workspace |
| `tabs` | preset tab keys | Shows a subset of tabs from the selected preset |
| `default_tab` | one visible tab key | Selects the initial tab when no remembered tab exists |
| `litter_id` | litter ID | Fixes the initial litter |
| `show_litter_selector` | boolean | Shows litter selection in applicable surfaces |
| `show_summary` | boolean | Shows the Summary above Home tabs |
| `show_today_only` | boolean | Limits care occurrences on Today and Attention to today |
| `show_bulk_action` | boolean | Shows the multi-puppy action in Journal |
| `default_selected` | `all`, `litter`, `mother`, `puppy` | Sets the initial owner scope where supported |
| `puppy_id` | puppy ID | Selects a specific puppy when `default_selected: puppy` |
| `state_key` | unique text | Separates remembered tab and filter state between otherwise identical Workspaces |
| `tab_config` | mapping | Applies advanced settings to one internal surface |

Only tabs belonging to the chosen preset are accepted. The available keys are
`today`, `attention`, `puppies`, `weighing`, `analysis`, `quickLog`, `dossier`,
`timeline`, `temperature`, `care`, `programs` and `reminders`.

Aggregate scope `all` is supported by Dossier and Timeline. Quick Log and
Temperature require one exact owner and therefore fall back to `litter` when
the workspace default is `all`. Existing dossier items remain editable in the
aggregate view; select a specific owner before adding a new item.

The visual editor changes with the selected preset. It exposes navigation and
the relevant Home, Growth, Journal, Care or Mobile surface options in grouped
sections, while writing those values to the same `tab_config` structure used
by YAML. Set `puppy_id` together with `default_selected: puppy`; it is ignored
for the other initial scopes. YAML remains available for uncommon options that
are not part of the visual editor.

## Advanced tab configuration

Use `tab_config` only for options not exposed by the workspace editor. Keys are
the tab names above; values are passed to that surface. For example, a compact
Growth workspace and a Journal focused on temperature can be configured as:

```yaml
type: custom:puppy-tracker-workspace-card
preset: growth
default_tab: analysis
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

```yaml
type: custom:puppy-tracker-workspace-card
preset: journal
tabs:
  - quickLog
  - temperature
default_tab: temperature
default_selected: mother
tab_config:
  temperature:
    default_range: 3d
    chart_height: 170
    history_limit: 10
    max_height: 520
    history_sort: newest
    show_selectors: true
    show_thresholds: true
    show_latest: true
    show_chart: true
    show_history: true
    show_editor: true
```

Useful surface-specific options include:

- `weighing`: `show_puppies`, `show_details`;
- `analysis`: `default_range`, `default_metric`, summary, analysis and milestone switches;
- `dossier`: `show_profile_note`, `show_timeline_items`;
- `timeline`: `max_items`, `show_history_toggle`, `show_timeline_items`;
- `temperature`: range, chart, thresholds, history and editor options documented in [Temperature](temperature-card.md);
- `care`: `show_day_selector`, `days_ahead`, `max_items`;
- `programs`: `show_disabled`, `max_items`, `compact`, `sort_order`.

The Mobile preset intentionally hides the day selector and loads today plus
overdue care actions. Opening a care item uses the full result and note editor.
Changing the litter in any visible Workspace surface updates the other tabs.
The active weighing surface is retained during that change so a draft weight
and input focus are not discarded.

## Owners and Report

Owners remains a separate card:

```yaml
type: custom:puppy-tracker-owner-card
title: Baasjes
```

Its create/edit form starts collapsed. Selecting an owner expands all stored
contact, placement, payment and note information; puppy linking is a separate
step.

Report also remains separate:

```yaml
type: custom:puppy-tracker-report-card
title: Rapporten
default_range: 7d
default_profile: full
```

`default_range` accepts `24h`, `3d`, `7d`, `14d`, `30d` or `all`.
`default_profile` accepts `full`, `handover` or `internal`. PDF sections remain
individually selectable in the card.

## Migrating from 0.24

This is an intentional breaking change. Standalone feature-card YAML is no
longer supported. Replace old types as follows:

| Previous card types | Replacement |
| --- | --- |
| Summary, Today, Attention, Litter | Workspace with `preset: home` |
| Weighing Station, Growth Overview | Workspace with `preset: growth` |
| Quick Log, Dossier, Timeline, Temperature, Bulk Dossier | Workspace with `preset: journal` |
| Care Execution, Care Programs, Recurring Reminders | Workspace with `preset: care` |
| Mobile Controls | Workspace with `preset: mobile` |
| Owners | No change |
| Report | No change |

Move old card options under the matching `tab_config` key. For example:

```yaml
# Before 0.25.0
type: custom:puppy-tracker-temperature-card
default_range: 14d
show_thresholds: true
```

```yaml
# From 0.25.0
type: custom:puppy-tracker-workspace-card
preset: journal
tabs:
  - temperature
default_tab: temperature
tab_config:
  temperature:
    default_range: 14d
    show_thresholds: true
```

Restart Home Assistant and fully refresh the browser or Companion App after
updating so the versioned frontend resource is reloaded.
