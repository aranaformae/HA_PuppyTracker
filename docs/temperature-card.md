# Temperature card

The Temperature surface in the Journal workspace displays and records
structured temperature data. It uses the same Puppy Tracker dossier data as
Quick Log, Dossier and Timeline, so a measurement entered in one surface is
available in the others after the normal live update.

## Add the card

Add this YAML to a Lovelace dashboard:

```yaml
type: custom:puppy-tracker-workspace-card
preset: journal
tabs:
  - temperature
default_tab: temperature
title: Temperatuur
default_selected: puppy
tab_config:
  temperature:
    default_range: 3d
    history_limit: 10
    max_height: 520
    chart_height: 170
    history_sort: newest
    show_selectors: true
    show_thresholds: false
    show_latest: true
    show_chart: true
    show_history: true
    show_editor: true
```

The integration serves and registers the Workspace automatically. Temperature
options belong under `tab_config.temperature`. After upgrading Puppy Tracker,
perform a full browser or Companion App refresh if Home Assistant still shows
an old card definition.

## Configuration

All settings are optional. The visual editor exposes the same settings where supported by the Home Assistant dashboard editor.

| Setting | Allowed values | Default | Description |
| --- | --- | --- | --- |
| `title` | text | `Temperatuur` | Heading shown for the surface |
| `litter_id` | existing litter ID | first available litter | Workspace option selecting the nest opened by default |
| `default_selected` | `litter`, `mother`, `puppy` | unset | Workspace option selecting the initial owner scope |
| `default_range` | `24h`, `3d`, `7d`, `14d`, `all` | `3d` | Selects the initial time range |
| `history_limit` | integer 3-50 | `10` | Limits the number of history rows before scrolling |
| `max_height` | integer 240-900 | `520` | Sets the history area's maximum height in pixels |
| `chart_height` | integer 100-500 | `170` | Sets the chart height in pixels |
| `history_sort` | `newest`, `oldest` | `newest` | Controls history row order |
| `show_selectors` | boolean | `true` | Shows litter, owner, puppy and period selectors |
| `show_thresholds` | boolean | `false` | Draws configured low/high reference lines in the chart |
| `threshold_low` | number 30-45 | `37.5` | Low chart reference in degrees Celsius |
| `threshold_high` | number 30-45 | `39.5` | High chart reference in degrees Celsius |
| `show_latest` | boolean | `true` | Shows the latest-reading summary |
| `show_chart` | boolean | `true` | Shows the temperature chart |
| `show_history` | boolean | `true` | Shows the measurement history |
| `show_editor` | boolean | `true` | Shows the add button and entry form |

The measurement history is an independent scroll area. Once it reaches
`max_height`, only the list of readings scrolls; the selectors, latest reading,
chart and input controls remain visible. This keeps the card usable on a phone
even when the selected period contains many readings.

Example for a fixed mother-dog view:

```yaml
type: custom:puppy-tracker-workspace-card
preset: journal
tabs: [temperature]
default_tab: temperature
title: Luna temperatuur
default_selected: mother
tab_config:
  temperature:
    default_range: 24h
    max_height: 360
```

Example for a compact puppy view in a mobile dashboard:

```yaml
type: custom:puppy-tracker-workspace-card
preset: journal
tabs: [temperature]
default_tab: temperature
title: Pup temperatuur
default_selected: puppy
tab_config:
  temperature:
    default_range: 3d
    history_limit: 6
    max_height: 360
    show_thresholds: true
    threshold_low: 37.5
    threshold_high: 39.5
```

## Using the card

The card provides these controls:

- Nest selector when multiple nests are available.
- Owner selector for the whole nest, the linked mother dog or one puppy.
- Puppy selector when puppy scope is active.
- Period selector for the last 24 hours, 3, 7 or 14 days, or all available history.
- Add-temperature action with temperature, date/time, measurement method/location and observation/note fields.

The latest reading is shown separately from the history. The trend chart uses
the selected period. Optional threshold lines are visual references only; they
do not create warnings or replace veterinary guidance. The history shows
date/time, value, optional method/location and the full observation text. Long
notes wrap within the row and the history area scrolls instead of expanding the
complete dashboard indefinitely.

## Data and ownership

Each saved measurement is a dossier record with `type: temperature` and a numeric Celsius value in `data.temperature_c`.

| Card scope | Stored owner |
| --- | --- |
| Whole litter | Litter dossier |
| Mother | Mother dossier for the selected nest |
| Puppy | Selected puppy dossier |

This owner distinction is important for reminders. A puppy temperature record completes a puppy-owned reminder only; it does not complete a mother-owned or litter-owned reminder. The same exact-owner rule is used by the other dossier surfaces.

The card ignores deleted records and only displays records with a valid numeric `temperature_c` value. The period filter affects the chart and visible history. If the selected period has no record, the latest-reading area can still show the newest available reading so the card does not appear empty after a temporary range change.

## Mobile use

The surface is responsive and collapses its selectors to one column on narrow
screens. The add action becomes full width on a phone, form fields remain large
enough for touch input, and history is independently scrollable. Add
`temperature` to a Journal workspace when it needs a dedicated dashboard view;
the Mobile preset stays focused on weighing, quick logging, today and care.

## Troubleshooting

If the card reports that no temperature data can be loaded, check that the selected nest still exists and that the linked mother profile is available when mother scope is selected. If a newly entered value is not immediately visible in another card, refresh the dashboard after confirming that the save action reported success.
