# Calculator: amounts and feeding

The **Calculator** tab is available in the Care and Mobile Workspace presets.
Choose **Per kg** for a freely entered amount, or **Feeding** for a combined
Ydolo Puppy / Kivo puppy-meat ration. Both variants use the latest puppy weights
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

The calculator is a read-only aid. It does not save a dose, feeding amount or
dossier entry and it does not determine whether an entered amount is suitable.
It does not round to a product-specific syringe, tablet or package increment.
Always use the instructions for the relevant product or a veterinarian's
advice.

## Feeding

The Feeding variant shows kibble, meat and their combined mass for every
puppy, per day and per portion. A litter total shows the same breakdown for
the puppies successfully calculated. Choose the meat share from 0 to 100%,
the Kivo amount from 40 to 50 g/kg/day and 1 to 12 equal portions per day.
Defaults are 50% meat, 45 g/kg/day and four portions. Sliders and the portion
input update results immediately without rebuilding inputs or moving focus.

The percentage is a **share of each product's full daily ration**, not a
percentage of combined grams. The calculation is:

```text
meat/day = weight_kg x Kivo_g_per_kg x meat_share
kibble/day = Ydolo_daily_ration x (1 - meat_share)
total/day = meat/day + kibble/day
each amount/portion = amount/day / portions_per_day
```

At 2 kg, 50% meat and 40 g/kg/day Kivo, the table-based result is 40 g meat
plus 48 g kibble per day. With four equal portions, that is 10 g meat plus
12 g kibble per portion, rather than two complete daily rations.
This proportional-ration calculation is not an energy-equivalent conversion;
it does not balance calories or vitamins/minerals between products.
It assumes each portion has the same mix. Separate meat-only and kibble-only
meals are not scheduled by this tool.

### Product bases

The Ydolo values come from the supplied `Ydolo_brokken.pdf`, page 2, which
labels the table for a medium-sized breed up to 20 kg:

| Puppy weight (kg) | Ydolo (g/day) |
| --- | --- |
| 1 | 57 |
| 2 | 96 |
| 5 | 191 |
| 10 | 267 |
| 15 | 327 |
| 20 | 360 |

**Feeding table** is the default. Between table points the tool interpolates
linearly. **PDF formula** instead uses the supplied approximation
`13.32 x weight_kg + 94.46`. These are deliberately separate choices: at 1 kg
the table says 57 g/day while the straight-line approximation yields 107.78
g/day. Neither choice extrapolates below 1 kg or above 20 kg. Puppies outside
that range receive no combined result and are excluded from totals when any
kibble is selected. With 100% meat the Ydolo range does not apply.
The PDF gives no adjustable range for Ydolo's coefficients, so the tool does
not invent one.

Kivo's [Rund & Kip puppy product advice](https://kivopetfood.nl/p/rund-kip-puppy/)
specifies 40 to 50 g/kg/day, divided over two to four meals depending on age,
and advises starting solid food no earlier than four weeks. That range is
the Kivo slider's product basis, verified on 14 October 2026. The tool permits
more portions as a planning choice, not as an additional product recommendation.
The calculation covers these foods only; milk, snacks, vegetables, supplements,
age-based needs and individual diet suitability are not calculated.
Check the current packaging/product guidance when applying the result.

Missing weights and out-of-range Ydolo weights are excluded rather than treated
as zero rations. Older weights remain calculated and marked. Values are rounded
only for display to one decimal gram; litter totals use the unrounded values.
The calculator does not write feeding records or automatically dose anything.

## Configuration

The visual editor exposes these settings for the Care and Mobile presets:

| Setting | Default | Purpose |
| --- | --- | --- |
| `active_only` | `true` | Hide inactive puppies |
| `stale_after_hours` | `24` | Mark older weights as stale; `0` disables the marker in YAML |
| `max_height` | `520` Care, `440` Mobile | Maximum result-list height before scrolling |
| `default_unit` | `ml` | Initial unit shown in the calculator |
| `default_mode` | `per_kg` | Start with `per_kg` or `feeding` |

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
Live Puppy Tracker updates are applied after the active input, slider or selector loses
focus, so a background weight refresh cannot interrupt typing on mobile.
