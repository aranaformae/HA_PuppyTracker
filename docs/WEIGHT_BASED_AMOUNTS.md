# Weight-based amounts for care and reminders

Enable **Weight-based amount** while adding or editing a care program or a
recurring reminder. This also works for feeding and other record categories.
Enter the amount yourself; Puppy Tracker supplies the multiplication, not a
product-specific prescription or food recommendation.

The three settings are:

- **Amount per kg per execution**: the amount for one planned execution, not an
  automatic daily total divided over reminder times.
- **Unit**: for example ml, mg or g. The calculation keeps this unit and does
  not convert mg into ml or round to whole tablets or portions.
- **Maximum weight age (hours)**: 24 is one day; 168 is one week. This tolerance
  belongs to the individual reminder/program, independently of the litter's
  planned weighing schedule.

The formula is `latest weight in grams / 1000 × amount per kg`. Only an active,
positive, non-future weighing of the selected puppy is used. Corrected and
deleted measurements follow the same canonical history rules as the dashboards.
The exact age limit is allowed; once exceeded, the amount is marked
**WEIGHT TOO OLD**, with the weight timestamp and allowed age beside it.

## Where amounts appear

Amounts are shown in Carry out care (including Mobile), Today, Attention,
recurring reminder management, the selected reminder in Quick Log and the
execution form. An open amount view updates its own warning at expiry without
rebuilding the card or losing typed text. It releases its timer when removed.

A whole-litter reminder shows separate amounts and warnings for each active
puppy in a bounded, scrollable list. No average or total litter weight is used.
A puppy without usable weighing history has an explicit missing-weight message
and no calculated amount. Mother profiles currently have no canonical weighing
history: their reminder likewise shows that no individual weight is available.

Built-in care/reminder notifications include the calculated amount and its
weight basis. The same notification tag is updated after a different effective
weighing, a changed formula or expiry, on the next normal notification check.
Unchanged dose information does not cause repeated mobile sends. Notification
preferences, existing lead windows and completion/clearing rules still apply.

## Record what was actually given

Opening an execution form refreshes the calculation from the saved source and
committed weight history. A failed refresh shows an unverified-calculation
message. Filling in a note while this check runs is supported.

The hint is read-only. Check it, then enter the actual amount administered or
fed in the existing record fields. Weight-based treatments disable the fixed planned amount controls and do not
prefill an old fixed planned dose. Saving records the entered amount; opening historical
records or exporting them later does not recalculate it from a newer weight.
Changing the hint settings does not reset existing care completions.

## Backups and templates

Reminder and care-program backups preserve the settings. Care templates can
also contain them, so a suitable formula can be reused per litter. Older data
without this optional object behaves as before. The object is:

```json
{
  "weight_dose": {
    "amount_per_kg": 5,
    "unit": "g",
    "max_weight_age_hours": 168
  }
}
```

These numbers illustrate the format only. Set `weight_dose` to `null` to turn
the calculation off. Formula values must be positive and finite; weight age
must be greater than zero and at most 8760 hours. The unit is required and at
most 32 characters.
