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
the puppies successfully calculated. Choose 0 to 100% meat and independently
set **Kibble portions per day** and **Meat portions per day** (1–12 for each
included food). Defaults are 50% meat, one kibble portion and two meat portions.
The card shows **3 feeding moments per day: 1 kibble and 2 meat** in this case.
Meals are separate food moments; this does not schedule their clock times.

Each food has its own calculation method. Open **Kibble: settings** or
**Meat: settings** to inspect and change its values:

| Method | Editable values | Full daily ration |
| --- | --- | --- |
| Formula | Factor (g/kg), fixed amount (g/day), minimum and maximum weight | Factor x weight in kg + fixed amount |
| Table | Weight in kg and daily grams per row | Linear interpolation between adjacent rows |
| Fixed g/kg rate | Grams per kg per day | Weight in kg x rate |
| Table by age and weight | Start age in days and a weight table per stage | Interpolation in the table for the current age stage |

Both foods support all four methods, independently. Formula factors and fixed
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
kibble/portion = kibble/day / kibble portions per day
meat/portion = meat/day / meat portions per day
feeding moments = kibble portions + meat portions (included foods only)
```

For example, with a kibble table value of 96 g/day at 2 kg, a meat rate of
40 g/kg/day and a 50% meat share, the result is 48 g kibble and 40 g meat per
day. With one kibble portion and two meat portions, give 48 g kibble at the
kibble moment and 20 g meat at each of the two meat moments. There are three
moments, not three mixed portions. No combined "total per portion" is shown,
because portions of different foods are separate meals. It does not add two
complete rations, balance calories or nutrients, or assess diet suitability.
Portions of the same food are equal; portions of different foods need not have
the same mass. A 0% food has no feeding moments, its portion input shows zero and is disabled
and its per-portion result is shown as a dash. Its configured count is retained
for when that food is included again. Use product instructions or
veterinary advice for suitable amounts.

Missing weights and weights outside an active food's table/formula range are
excluded from totals rather than treated as zero rations. The row identifies
which food is out of range. A food with a 0% share does not impose its weight
range. Older weights remain calculated and marked. Results are rounded to one
decimal gram for display; totals use unrounded values.

### Tables by age and weight

Select **Table by age and weight** for either food. The first stage copies that
food's existing weight table, starting at day 0; review its values against your
food instructions. Add stages with the plus button and enter **From age (days)**.
Each new stage copies the preceding table for editing, initially starting seven
days later. These are editor starting values, not feeding recommendations.

Stages have strictly increasing whole start days (0–3650), at most 24 stages,
and each stage has a normal 2–100-row weight table. The newest stage whose start
day has been reached applies, including that start day. It remains active until
the next stage; the last stage has no automatic end date. There is no interpolation
between ages, only between weights within the selected stage. Weight boundaries
still apply. Delete stages or table rows with the corresponding minus/delete
buttons; retain at least one stage and two rows per table.

Age uses completed 24-hour periods since the puppy's birth time, falling back to
the litter birth date when no puppy birth time is available. Missing or future
birth dates, ages before the first stage and weights outside that stage's table
produce a visible warning and exclude that puppy from totals. The age used is
shown with successful age-table results. A food at 0% needs no age calculation.

### Kcal allocation

Choose **Daily kcal** under **Calculate allocation using** to use energy instead
of proportional full rations. Enter a daily target in **kcal/kg body weight** and
the actual **kcal/100 g** of each included food. No energy target or density is
provided as a feeding recommendation: these fields start at zero and must be
filled before calculation and saving. Use product information and professional
advice for appropriate values and diet suitability.

In this mode the meat slider specifies the share of daily **kcal**, not grams:

```text
daily kcal = weight in kg x configured kcal/kg/day
meat/day (g) = daily kcal x meat share x 100 / meat kcal per 100 g
kibble/day (g) = daily kcal x (1 - meat share) x 100 / kibble kcal per 100 g
```

For a calculation example only: at 2 kg, a target of 100 kcal/kg/day is 200
kcal/day. At 50% meat, with 200 kcal/100 g meat and 400 kcal/100 g kibble, this
gives 50 g meat and 25 g kibble per day. Independent portion counts then divide
those quantities just as in ration mode. The daily kcal used is shown per puppy.
This matches the configured energy target; it does not balance nutrients or
determine an appropriate target automatically.

Ration-method controls are hidden in kcal mode but their settings remain stored.
Switching back restores the selected formulas/tables and their values. An excluded
food does not need an energy density. Included densities and the daily target must
be finite and positive. Energy mode does not apply ration weight or age boundaries.

All food profiles, age tables, allocation mode, kcal values, the meat share and both portion counts save automatically
**per litter** when you finish a change. They return after reloading and are
shared with other devices. Only administrators can change these preferences.
Calculation updates do not rebuild the controls or move input focus.
The save status confirms success; if saving fails, the draft remains visible
and **Retry save** lets you try again. Invalid values are not saved.

Full and litter backups include these settings. Importing a single puppy into
an existing litter does not change that litter's plan. Previously saved
calculator preferences retain their daily rations. An old shared portion count
is split between kibble and meat according to the selected ratio, with at least
one moment per included food. Four shared portions at 50% become two kibble
and two meat moments. A single shared mixed portion becomes two separate
moments if both foods are included. Review these converted counts before use;
per-portion quantities now follow the separate meals instead of the old mix.
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
