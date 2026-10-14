# Calculator: amounts and feeding

The **Calculator** tab is available in the Care and Mobile Workspace presets.
Choose **Per kg** for a freely entered amount, or **Feeding** for a combined
kibble / meat ration. Both variants use the latest puppy weights
and retain their working values when switching between them.

## Per-kilogram amounts

It calculates an amount for every puppy from the latest recorded weight:

```text
amount needed = weight in kilograms x amount per kilogram
```

Enter the amount per kilogram and a unit such as `ml`, `mg` or `g`. Decimal
commas and decimal points are accepted. The result appears immediately for
each puppy, together with the collar colour, weight used and a litter total.
Each row also shows the measurement time, elapsed time and calculation formula
so it is clear which stored value produced the result.

Puppies without a valid weight are not included in the total. A weight older
than the configured threshold is clearly marked but remains available for the
calculation, so check it before using the result. By default, inactive puppies
are hidden.

The per-kilogram calculator is a read-only aid. It does not save a dose, feeding amount or
dossier entry and it does not determine whether an entered amount is suitable.
It does not round to a product-specific syringe, tablet or package increment.
Always use the instructions for the relevant product or a veterinarian's
advice.

## Feeding

The Feeding variant shows **Kibble**, **Meat** and their combined mass for every
puppy, per day and per portion. A litter total shows the same breakdown for
the puppies successfully calculated. Choose 0 to 100% meat and 1 to 12 equal
portions per day. Defaults are 50% meat and four portions.

Each food has its own calculation method. Open **Kibble: settings** or
**Meat: settings** to inspect and change its values:

| Method | Editable values | Full daily ration |
| --- | --- | --- |
| Formula | Factor (g/kg), fixed amount (g/day), minimum and maximum weight | Factor x weight in kg + fixed amount |
| Table | Weight in kg and daily grams per row | Linear interpolation between adjacent rows |
| Fixed g/kg rate | Grams per kg per day | Weight in kg x rate |

Both foods support all three methods, independently. Formula factors and fixed
amounts must be non-negative and cannot both be zero. A formula is only used
inside its configured positive weight range. A table has 2 to 100 rows with
positive rations and strictly increasing positive weights. Use the plus/minus
buttons to add or remove rows. It never extrapolates outside the first/last
table weight. A fixed rate must be positive and has no table weight boundary.

The initial kibble table is:

| Puppy weight (kg) | Full daily ration (g) |
| --- | --- |
| 1 | 57 |
| 2 | 96 |
| 5 | 191 |
| 10 | 267 |
| 15 | 327 |
| 20 | 360 |

The initial alternative formula is `13.32 x kg + 94.46`, with a 1–20 kg
range. Meat starts with a fixed 45 g/kg/day rate. These retain the original
calculator's starting values, not a universal feeding recommendation.
Replace them with the instructions for your actual food. The initial meat
formula is `45 x kg`, and its alternative table has points 1 kg / 45 g and
20 kg / 900 g; those inactive alternatives are editable too.

The percentage is a **share of each product's full daily ration**, not a
percentage of combined grams:

```text
meat/day = full meat daily ration x meat share
kibble/day = full kibble daily ration x (1 - meat share)
total/day = meat/day + kibble/day
each amount/portion = amount/day / portions per day
```

For example, with a kibble table value of 96 g/day at 2 kg, a meat rate of
40 g/kg/day and a 50% meat share, the result is 48 g kibble and 40 g meat per
day. Four portions contain 12 g kibble and 10 g meat each. It does not add two
complete rations, balance calories or nutrients, or assess diet suitability.
It assumes every portion has the same mix. Use product instructions or
veterinary advice for suitable amounts.

Missing weights and weights outside an active food's table/formula range are
excluded from totals rather than treated as zero rations. The row identifies
which food is out of range. A food with a 0% share does not impose its weight
range. Older weights remain calculated and marked. Results are rounded to one
decimal gram for display; totals use unrounded values.

All food profiles, the meat share and number of portions save automatically
**per litter** when you finish a change. They return after reloading and are
shared with other devices. Only administrators can change these preferences.
Calculation updates do not rebuild the controls or move input focus.
The save status confirms success; if saving fails, the draft remains visible
and **Retry save** lets you try again. Invalid values are not saved.

Full and litter backups include these settings. Importing a single puppy into
an existing litter does not change that litter's plan. Previously saved
calculator preferences are converted without changing their calculations.
The calculator does not write feeding records or automatically dose anything.

## Configuration

The visual editor exposes these settings for the Care and Mobile presets:

| Setting | Default | Purpose |
| --- | --- | --- |
| `active_only` | `true` | Hide inactive puppies |
| `stale_after_hours` | `24` | Mark older weights as stale; `0` disables the marker in YAML |
| `max_height` | `520` Care, `440` Mobile | Maximum result-list height before scrolling |
| `default_unit` | `ml` | Initial unit shown in the calculator |
| `default_mode` | `per_kg` | Initial variant if no choice is remembered in this browser |

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
    default_mode: feeding
```

The entered amount and unit are working values for the current card session.
They are intentionally not stored as medication or feeding instructions.
The selected calculator variant is remembered in this browser; feeding
preferences are stored with the litter, not just with the card.
Live Puppy Tracker updates are applied after the active input, slider or selector loses
focus, so a background weight refresh cannot interrupt typing on mobile.
