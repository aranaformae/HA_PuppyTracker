# Standalone Feeding Calculator Specification

This specification describes the feeding calculator released with Puppy Tracker
v0.28.15. It can be rebuilt as a public, mobile-first web tool for puppy owners,
without Home Assistant, integration credentials or access to breeder records.
For the integration's user-facing instructions, see [CALCULATOR.md](CALCULATOR.md).

## Purpose and Owner Workflow

The tool calculates grams of kibble and/or meat per day and per separate meal.
It does not determine whether a diet, energy target or combination is suitable.
It does not prescribe medication or automatically log feeding events.

Suggested first screen for an owner:

1. Select a breeder-provided feeding profile, or use one preselected profile.
2. Enter the puppy's current weight in **kg**. Optionally enter a name for display.
3. For an age-specific profile, enter age in completed days or a birth date/time.
4. Choose the meat share using a 0-100% slider.
5. Set separate daily portion counts for kibble and meat.
6. Immediately show both daily amounts, both per-portion amounts and total meals.

Show profile configuration in a separate, collapsed settings section. Owners
usually need weight, age, ratio and portions, not a large formula/table editor.
The breeder can supply a JSON profile containing the actual product instructions.
For public use, label the selected profile and its source/review date separately
from the numeric calculation settings. Product names are optional display metadata,
not part of the calculation. Do not infer nutritional suitability from a brand.

## Two Independent Choices

**Allocation basis** determines how the meat percentage is interpreted:

- `ration`: the selected percentage of each food's complete daily ration.
- `energy`: the selected percentage of a configured daily kcal target.

In ration mode, **each food independently** selects one of four methods:

- `per_kg`: fixed grams per kg of puppy body weight per day.
- `linear`: grams per kg times body weight, plus a fixed daily amount.
- `table`: interpolate in a current-weight-to-daily-grams table.
- `age_table`: select an age stage, then interpolate in that stage's weight table.

Energy mode uses the configured kcal target and food energy densities instead.
It does not also apply the ration formula or age/weight table. Keep those inactive
settings intact when switching allocation modes.

## Inputs and Units

| Input | Unit and rule |
| --- | --- |
| Current puppy weight | kg; finite and greater than zero |
| Age | Completed days; non-negative, needed only for an included age-table food |
| Meat share | Percentage from 0 to 100 |
| Kibble portions per day | Whole number 1-12 when kibble is included |
| Meat portions per day | Whole number 1-12 when meat is included |
| Fixed food rate | g/kg body weight/day; greater than zero |
| Formula coefficient | g/kg body weight/day; non-negative |
| Formula offset | g/day; non-negative; coefficient and offset cannot both be zero |
| Formula weight range | kg; positive minimum less than maximum |
| Table weights | kg of the puppy's current body weight, not expected adult weight |
| Table rations | Full g/day for that food; positive |
| Stage start | Whole completed days from 0 to 3650 |
| Energy target | kcal/kg body weight/day; explicitly supplied and positive in energy mode |
| Food energy density | kcal/100 g; explicitly supplied and positive for each included food in energy mode |

Accept decimal commas and decimal points in the UI, but store numeric JSON
values. Reject empty values where a number is required, booleans, negative values,
NaN and infinity. Do not silently convert an empty required field to zero.

An excluded food has zero meals in the result. Its portion control displays zero
and is disabled, while its previously configured count can be retained for later.
The stored count may be zero for an excluded food; when including that food again,
require a positive count before calculating. Its age, weight range and energy
density do not impose calculation requirements on the included food.

## Canonical Settings JSON

The following example is a **synthetic calculation fixture, not feeding advice**.
It demonstrates the complete settings shape, including inactive alternatives:

```json
{
  "allocation_mode": "ration",
  "kcal_per_kg": 100,
  "meat_percent": 50,
  "kibble_portions_per_day": 1,
  "meat_portions_per_day": 2,
  "kibble": {
    "method": "age_table",
    "grams_per_kg": 40,
    "coefficient": 10,
    "offset": 20,
    "min_kg": 1,
    "max_kg": 3,
    "table": [[1, 40], [3, 120]],
    "kcal_per_100g": 400,
    "age_tables": [
      {"from_day": 21, "table": [[1, 40], [3, 120]]},
      {"from_day": 35, "table": [[1, 80], [3, 200]]}
    ]
  },
  "meat": {
    "method": "per_kg",
    "grams_per_kg": 40,
    "coefficient": 40,
    "offset": 0,
    "min_kg": 0.1,
    "max_kg": 20,
    "table": [[1, 40], [20, 800]],
    "kcal_per_100g": 200,
    "age_tables": []
  }
}
```

When reusing Puppy Tracker's module, retain all profile fields. Inactive parameters
are also validated; malformed hidden tables must not be silently saved. An empty
`age_tables` array is allowed unless `age_table` is selected in ration mode.
Reject unknown fields inside the canonical settings/profile objects. Put optional
website metadata in a separate envelope, not in the calculation settings.

Do not ship this fixture or the integration's historical starting values as a
universal puppy feeding recommendation. In the integration, energy targets and
densities default to zero and need explicit configuration before use.

## Exact Calculations

Use full precision internally. Let `W` be weight in kg and `s = meat_percent / 100`.

### Full Daily Ration for One Food

```text
per_kg: B = W * grams_per_kg
linear: B = W * coefficient + offset
```

A linear formula only applies within its inclusive configured weight range.
A fixed g/kg rate has no table/formula weight boundary.

For `table`, find adjacent points `(w0, g0)` and `(w1, g1)` surrounding `W`:

```text
B = g0 + (g1 - g0) * (W - w0) / (w1 - w0)
```

A table requires 2-100 rows with positive, strictly increasing weights and positive
grams. Rations need not increase with weight. Endpoints are included. Never
extrapolate below the first or above the last weight, and do not clamp to an endpoint.

For `age_table`, select the last stage with `from_day <= ageDays` and use its table.
Stage starts must be strictly increasing whole days, with at most 24 stages.
There is no interpolation between ages. At a stage start the new stage applies;
the last stage remains active until the next stage, or indefinitely if it is last.
Before the first stage there is no calculation.

If deriving age from a birth timestamp, use:

```text
ageDays = floor((nowTimestamp - birthTimestamp) / 86400000)
```

These are elapsed 24-hour periods, not calendar-day differences. A missing,
invalid or future birth date must not silently become age zero. For a date-only
website field, explicitly choose and document a timezone/midnight convention,
or ask owners for age in days to avoid ambiguity near stage transitions.

### Ration Allocation

Calculate each included food's full ration `B` with its selected method:

```text
meatDailyGrams   = meatFullRation * s
kibbleDailyGrams = kibbleFullRation * (1 - s)
totalDailyGrams  = meatDailyGrams + kibbleDailyGrams
```

Here 50% means half of each food's full daily ration. It does **not** mean equal
grams or equal kcal. Do not add two full rations together when both foods are used.

### Energy Allocation

```text
dailyKcal       = W * kcal_per_kg
meatDailyGrams  = dailyKcal * s * 100 / meat.kcal_per_100g
kibbleDailyGrams = dailyKcal * (1 - s) * 100 / kibble.kcal_per_100g
totalDailyGrams = meatDailyGrams + kibbleDailyGrams
```

Only evaluate the division for included foods; a zero-share food contributes zero
without requiring a density. Label the slider as a **kcal share** in this mode.
This matches a supplied energy target, not a nutritional balance. Do not derive
an energy target automatically using an adult-dog factor or an assumed breed rule.

### Separate Meals

```text
kibblePerPortion = kibbleDailyGrams / kibblePortionsPerDay
meatPerPortion   = meatDailyGrams / meatPortionsPerDay
feedingMoments   = includedKibblePortions + includedMeatPortions
```

For example, one kibble portion plus two meat portions means three separate
feeding moments. Do not divide both foods by three. There is no combined
"total grams per portion": the separate meal sizes may differ. Show a dash for
an excluded food's per-portion quantity. Counts do not schedule meal times.

## Results and Errors

Show a compact result table, including only an overall daily total:

| Food | Grams per day | Grams per portion |
| --- | --- | --- |
| Kibble | Calculated amount | Amount per kibble meal, or dash |
| Meat | Calculated amount | Amount per meat meal, or dash |
| Total | Combined daily mass | No combined portion value |

Below it show the feeding moments with their breakdown, for example
**3 per day: 1 kibble and 2 meat**. In energy mode also show daily kcal; with an
active age table show the age used. Optional last-weighed information can warn
about an old weight without silently replacing it.

The reusable module returns these statuses:

- `ok`: valid result; amounts are numbers, never preformatted strings.
- `missing_weight`: no positive finite weight.
- `invalid_settings`: incomplete or invalid profile, portion count or kcal data.
- `missing_age`: an included age-table food has no usable age.
- `before_age_stage`: age precedes the first stage; `food` identifies which one.
- `outside_food_range`: weight is outside an active formula/table; `food` identifies it.

On an error, clear previous result amounts to dashes and explain the issue near
the result. Never leave a previous puppy's or previous weight's ration visible
as if it belonged to the current input. Do not treat a failed calculation as
zero food. If showing several puppies, exclude invalid results from totals and
show the number of successfully calculated puppies.

Round only for display, normally to one decimal gram. Use the locale's number
format. Calculate totals from unrounded values, not the displayed rounded rows.
Do not imply precision appropriate for a particular measuring scoop or scale.

## Reusing the Existing JavaScript

`custom_components/puppy_tracker/frontend/puppy-tracker-feeding-calculator.js`
is a standalone ES module. It has no Home Assistant, DOM, network or library
dependencies. Copy it into the website project, retain the repository's applicable
license, and import it directly. The separate card file is **not** needed.

```js
import {
  feedingSettingsFromStored,
  feedingSettingsForStorage,
  feedingSchedule,
  calculateFeedingForWeight,
} from "./puppy-tracker-feeding-calculator.js";

const settings = feedingSettingsFromStored(breederProfile);
const weightKg = 2;
const ageDays = 28;
const result = calculateFeedingForWeight(weightKg * 1000, settings, ageDays);
const validProfile = feedingSettingsForStorage(settings); // JSON object or null
const meals = feedingSchedule(settings); // {kibble, meat, total}, or null
```

`feedingSettingsFromStored` maps snake_case storage settings to the working UI
model: `allocationMode`, `kcalPerKg`, `meatPercent`, `kibblePortions`,
`meatPortions`, `kibble`, `meat`. Food profile keys stay snake_case.
`calculateFeedingForWeight` expects weight in **grams**, not kg. Its successful
result contains `meatDaily`, `kibbleDaily`, `totalDaily`, `meatPerPortion`,
`kibblePerPortion`, `feedingMoments` and `kcalDaily` (null in ration mode).

The helper also reads older integration settings, but a newly built website can
use the canonical format above without adding a separate legacy UI.

## State, Privacy and Interaction

- Use local browser state for an owner's working values; no integration access is required.
- Version the website state and separate puppy inputs from breeder profile settings.
- Validate imported profiles before using or storing them. Offer an explicit reset;
  do not replace a malformed draft silently with a default feeding recommendation.
- Preserve settings when switching ration/energy modes or food methods.
- Update result text on input; do not rebuild the whole form on each keystroke.
- Keep controls mounted, retain focus and avoid scroll-to-top after calculation.
- Use labelled inputs, a slider for share, numeric portion inputs and a compact
  results section. Keep the extended editor collapsed by default on mobile.
- Do not embed breeder passwords, Home Assistant tokens, backups or owner contact
  details in the public page or its profile JSON.
- Browser-local data is convenience storage, not a private server backup. Explain
  that clearing browser data resets the local inputs.

## Acceptance Examples

All numbers below are **software test fixtures**, not recommended rations.
Use the canonical profile above unless otherwise stated.

| Case | Expected daily result |
| --- | --- |
| Ration mode, 2 kg, age 28, 50% meat | 40 g kibble, 40 g meat; kibble/portion 40 g, meat/portion 20 g; 3 meals |
| Ration mode, 2 kg, age 35, 50% meat | 70 g kibble, 40 g meat; kibble/portion 70 g, meat/portion 20 g |
| Ration mode, age 20 with included kibble | `before_age_stage`, no ration |
| Ration mode, missing age with included kibble | `missing_age`, no ration |
| Ration mode, 0.5 kg with included age-table kibble | `outside_food_range`, no ration |
| Ration mode, 2 kg, 100% meat, missing age | 0 g kibble, 80 g meat; 2 meals; no age requirement |
| Energy mode, 2 kg, 50% meat | 200 kcal/day; 25 g kibble, 50 g meat; portions 25 g and 25 g; 3 meals |
| Energy mode, 2 kg, 0% meat | 200 kcal/day; 50 g kibble, 0 g meat; 1 meal; meat density may be zero |
| Energy mode, 2 kg, 100% meat | 200 kcal/day; 0 g kibble, 100 g meat; 2 meals; kibble density may be zero |
| Energy mode, missing active food density | `invalid_settings`, no ration |
| Duplicate stage starts or table weights | Invalid settings, cannot save |
| Switch energy to ration and back | Both configurations and independent portions retained |

Also test decimal-comma entry, missing weights, future birth dates, inclusive
stage starts, exact table endpoints, fractional/zero active portion counts,
NaN/infinity, local state reload, mobile focus stability and translated labels.
