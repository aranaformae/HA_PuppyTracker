# Per-kilogram calculator

The **Calculator** tab is available in the Care and Mobile Workspace presets.
It calculates an amount for every puppy from the latest recorded weight:

```text
amount needed = weight in kilograms x amount per kilogram
```

Enter the amount per kilogram and a unit such as `ml`, `mg` or `g`. Decimal
commas and decimal points are accepted. The result appears immediately for
each puppy, together with the collar colour, weight used and a litter total.

Puppies without a valid weight are not included in the total. A weight older
than the configured threshold is clearly marked but remains available for the
calculation, so check it before using the result. By default, inactive puppies
are hidden.

The calculator is a read-only aid. It does not save a dose, feeding amount or
dossier entry and it does not determine whether an entered amount is suitable.
Always use the instructions for the relevant product or a veterinarian's
advice.

## Configuration

The visual editor exposes these settings for the Care and Mobile presets:

| Setting | Default | Purpose |
| --- | --- | --- |
| `active_only` | `true` | Hide inactive puppies |
| `stale_after_hours` | `24` | Mark older weights as stale; `0` disables the marker in YAML |
| `max_height` | `520` Care, `440` Mobile | Maximum result-list height before scrolling |
| `default_unit` | `ml` | Initial unit shown in the calculator |

The same options can be set in YAML:

```yaml
type: custom:puppy-tracker-workspace-card
preset: care
default_tab: calculator
tab_config:
  calculator:
    active_only: true
    stale_after_hours: 12
    max_height: 480
    default_unit: ml
```

The entered amount and unit are working values for the current card session.
They are intentionally not stored as medication or feeding instructions.
