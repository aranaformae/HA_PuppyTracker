# Temperature card

`custom:puppy-tracker-temperature-card` is a focused Lovelace card for viewing and entering structured temperature records. It uses the same Puppy Tracker dossier data as Quick Log, Dossier and Timeline, so a measurement entered in one surface is available in the others after the normal live update.

## Add the card

Add this YAML to a Lovelace dashboard:

```yaml
type: custom:puppy-tracker-temperature-card
title: Temperatuur
default_scope: puppy
default_range: 3d
history_limit: 10
max_height: 520
```

The integration serves and registers the card automatically. After installing or upgrading Puppy Tracker, perform a full browser or Companion App refresh if Home Assistant still shows an old card definition.

## Configuration

All settings are optional. The visual editor exposes the same settings where supported by the Home Assistant dashboard editor.

| Setting | Allowed values | Default | Description |
| --- | --- | --- | --- |
| `title` | text | `Temperatuur` | Heading shown at the top of the card |
| `litter_id` | existing litter ID | first available litter | Selects the nest opened by default |
| `default_scope` | `litter`, `mother`, `puppy` | `litter` | Selects the initial owner scope |
| `default_range` | `24h`, `3d`, `7d`, `14d`, `all` | `3d` | Selects the initial time range |
| `history_limit` | integer 3-50 | `10` | Limits the number of history rows before scrolling |
| `max_height` | integer 240-900 | `520` | Sets the history area's maximum height in pixels |

Example for a fixed mother-dog view:

```yaml
type: custom:puppy-tracker-temperature-card
title: Luna temperatuur
default_scope: mother
default_range: 24h
max_height: 360
```

Example for a compact puppy view in a mobile dashboard:

```yaml
type: custom:puppy-tracker-temperature-card
title: Pup temperatuur
default_scope: puppy
default_range: 3d
history_limit: 6
max_height: 360
```

## Using the card

The card provides these controls:

- Nest selector when multiple nests are available.
- Owner selector for the whole nest, the linked mother dog or one puppy.
- Puppy selector when puppy scope is active.
- Period selector for the last 24 hours, 3, 7 or 14 days, or all available history.
- Add-temperature action with temperature, date/time, measurement method/location and observation/note fields.

The latest reading is shown separately from the history. The trend chart uses the selected period. The history shows date/time, value, optional method/location and the full observation text. Long notes wrap within the row and the history area scrolls instead of expanding the complete dashboard indefinitely.

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

The card is responsive and collapses its selectors to one column on narrow screens. The add action becomes full width on a phone, form fields remain large enough for touch input, and history is independently scrollable. For a combined phone workflow, use `custom:puppy-tracker-mobile-card`; the dedicated temperature card is useful when temperature is an important standalone monitoring surface.

## Troubleshooting

If the card reports that no temperature data can be loaded, check that the selected nest still exists and that the linked mother profile is available when mother scope is selected. If a newly entered value is not immediately visible in another card, refresh the dashboard after confirming that the save action reported success.
