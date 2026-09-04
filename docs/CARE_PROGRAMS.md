# Age-based care programs

This document defines the architectural contract for Puppy Tracker age-based litter care programs.

## Purpose

Age-based care programs schedule actions from each puppy's age. They are intentionally separate from generic recurring reminders: a late or missed age-based action must never shift later occurrences.

Examples include ENS over days 3–16, ESI over days 3–16 and a one-time deworming action at a configured age. The built-in starters are practical examples and are not veterinary protocols.

## Persistent program, derived occurrence, dossier result

The feature follows three layers:

```text
persistent care program definition
        ↓
derived per-puppy age occurrence
        ↓
normal structured puppy dossier record
```

`care_programs.py` owns persistent program definitions. `care_occurrences.py` derives occurrences from a program and puppy `birth_time`. `care_results.py` records outcomes through the normal dossier storage. `care_program_api.py` exposes the backend contract to frontend surfaces.

Concrete occurrences are not a second persistent task database. Results are not stored in reminder state.

## Schedule modes

Programs support:

- `once`: one occurrence at one configured age day;
- `range`: occurrences from an inclusive start age through an inclusive end age, with configurable `interval_days`.

A program may also define an optional local `HH:MM` time of day.

The calendar is anchored to puppy age. Completing or missing one occurrence never changes the schedule of another occurrence.

### Local clock and timezone semantics

A configured care time is Home Assistant local wall-clock intent. For example, `09:00` means 09:00 in the Home Assistant local timezone on the target age date, not 09:00 UTC and not the offset that happened to apply on the puppy's birth date.

Occurrence derivation converts the puppy birth instant to Home Assistant local time, applies the age-day offset and then applies the configured local clock. The target date therefore receives the correct timezone/DST offset.

An occurrence with a configured time remains `upcoming` earlier on the same local date. It becomes `due_today` at the configured time. An occurrence without a configured time is due for the entire target local calendar day.

## Program revisions and per-puppy occurrence identity

Occurrences are derived for active puppies with a valid `birth_time`. Missing birth time is reported/skipped rather than guessed, and Today/Attention must make that skipped state visible to the user.

Program definitions carry a positive integer `revision`.

Revision 1 preserves the original v0.17.0 occurrence identity exactly:

```text
program_id:puppy_id:age_days
```

Revision 2 and later include the program revision:

```text
program_id:rREVISION:puppy_id:age_days
```

This keeps already-recorded v0.17.0 dossier results resolvable while allowing a genuinely changed protocol to receive a new deterministic occurrence namespace.

ENS day 7 for puppy A is always a different occurrence from ENS day 7 for puppy B and from ENS day 8 for puppy A.

### What changes a revision

The following fields define occurrence/result identity:

```text
title
record_type
schedule_type
start_age_days
end_age_days
interval_days
time_of_day
result_fields
```

Changing one of these fields before any result exists increments the program revision. Operational toggles such as `enabled`, `notifications_enabled` and `notification_lead_minutes`, and presentation-only `description`, do not change occurrence identity.

### Protocol lock after results exist

Once an active dossier result exists for a care program, occurrence-identity fields are locked. Editing one of those fields is rejected with the expectation that a new care program is created instead.

This protects historical meaning: old dossier results must never become ambiguous because the schedule, title, record type, clock time or result schema of their originating protocol was rewritten afterward.

Active results from an inactive puppy still protect the protocol. Soft-deleted results do not count as active results.

## Program-store integrity

Care program definitions use a dedicated Home Assistant `Store`.

Storage rules are deliberately conservative:

- `record_type` and all program fields are validated at the persistence boundary;
- old programs without a revision migrate to revision 1;
- explicit invalid revisions are rejected rather than silently normalized;
- unreadable/future program definitions are preserved under `quarantined_programs` instead of being silently deleted;
- loading a valid unchanged program preserves its existing `updated_at` value;
- create/update/delete mutations restore the previous in-memory state if the Home Assistant storage write fails.

Diagnostics expose aggregate care-program and quarantine counts without exposing program contents or names.

## Completion and results

Completion is dossier-backed. Recording an occurrence creates a normal puppy dossier record containing stable care metadata, including the program ID, program revision, occurrence ID, age day, scheduled time, completion/missed status and configured structured result data.

The scheduled timestamp and actual event timestamp have different meanings. `care_scheduled_at` records the planned occurrence. `occurred_at` remains the real event/registration time and must not be rewritten to make a late action appear on time.

Current result capabilities include optional result, score and note fields plus extensible structured care data.

A second active result for the same `care_occurrence_id` is rejected. Soft-deleted dossier records do not count as completion.

The result API re-derives the requested occurrence from the authoritative program and puppy rather than trusting arbitrary schedule metadata supplied by the frontend.

## Care-program templates

`care_templates.py` owns a separate user-template store. The Care Programs card exposes four built-in, read-only starters:

- ENS: 14 daily occurrences from age day 3, with step-by-step handling instructions;
- ESI: 14 daily occurrences from age day 3, with one day-specific scent suggestion per age day;
- deworming: occurrences at 2, 4, 6 and 8 weeks, with a veterinary disclaimer;
- daily neonatal check: a daily check from age day 0 through day 14.

Templates contain the fields needed to create a care program, including schedule, result fields, attention/notification settings, general instructions and optional `instructions_by_age`. Users can save an existing program as a user-owned template, edit it externally as JSON, download all visible templates and import them again. Built-in IDs are reserved and cannot be overwritten or deleted.

Template imports are validated using the same care-program normalization rules as normal program creation. The WebSocket batch-save operation validates the complete file before persisting it, so an invalid template cannot leave a partially imported batch behind. A template is copied into a litter program; later edits to the template do not mutate programs that were already created from it.

## How to build a care-program template

A template is a reusable starting point for one protocol. It should describe
what needs to happen, when it happens, what the user should record and whether
an unfinished item should appear in the Attention card. It is configuration,
not a diagnosis and not a replacement for a veterinarian's instructions.

### 1. Start with the protocol goal

Give the template a short, recognizable `name`, such as `ENS - rustige
neonatale prikkels` or `Dagelijkse controle`. Use `description` for the purpose,
scope and important safety context. Keep the description stable and concise;
put the actual step-by-step workflow in `instructions`.

### 2. Choose the dossier type

Set `record_type` to the kind of dossier entry the completed action should
create. Common values are `note`, `temperature`, `vaccination`, `test`,
`deworming`, `medication`, `vet_visit`, `milestone` and `other`. Choose the
most specific type available because it makes dossier filters, reports and
follow-up actions more useful.

### 3. Define the age schedule

Use `schedule_type: range` for a protocol repeated over multiple age days and
`schedule_type: once` for one age day. Age days are inclusive and are counted
from each puppy's `birth_time`:

```text
start_age_days: 3
end_age_days: 16
interval_days: 1
```

This creates 14 occurrences: days 3 through 16. The interval must be a
positive number of days. For an `once` template, `end_age_days` and
`interval_days` are not needed; `start_age_days` is the target day. Add
`time_of_day` only when the action should appear at a particular local time,
for example `09:00`. Leave it empty when the whole local calendar day is
acceptable.

### 4. Write safe general instructions

Put the procedure that applies every time in `instructions`. A useful format
is:

```text
1. Prepare the materials and check that the puppy is warm and settled.
2. Perform one short step at a time.
3. Observe breathing, movement and stress signals.
4. Stop when the puppy becomes distressed and record the response.
```

Instructions should tell the user what to do, what to observe and when to
stop. Avoid embedding a puppy name, litter name, fixed date, dosage or other
value that will be wrong when the template is reused. For medication,
deworming or veterinary protocols, record that the product and dosage must be
confirmed by the veterinarian rather than hard-coding a universal instruction.

### 5. Add day-specific instructions when the protocol builds gradually

Use `instructions_by_age` when the action changes by age day. The keys are age
days as strings and the values are the instruction shown for that day's
occurrence. The day-specific instruction supplements the general
`instructions`; it does not replace the general safety guidance.

For an ESI-style protocol, increase exposure gradually, use one clean and
controlled scent at a time, allow the puppy to move away and never force
contact. Do not use essential oils, perfume, smoke, cleaning products or loose
small materials. The actual scent list is a local protocol choice and should
be reviewed for puppy safety.

### 6. Decide what completion records

`result_fields` controls the fields shown when a user completes or misses an
occurrence. Use any combination of:

- `result` for a short outcome such as `rustig`, `goed` or `niet uitgevoerd`;
- `score` for a simple numeric assessment where that is meaningful;
- `note` for the observation or exception that needs more context.

Keep the set small and purposeful. A result field is saved in the puppy's
normal dossier record, so it remains available to reports and later review.

### 7. Configure attention and notifications separately

Set `counts_for_attention` to `true` when an open occurrence should be shown
on the Attention card. Set it to `false` for an informational or optional
protocol that should remain available in Today and the care-program view
without adding pressure to the attention overview. Weight and health-related
monitoring alerts are independent and remain visible even when a care program
does not count for attention.

`notifications_enabled` controls automatic notifications for this program.
`notification_lead_minutes` optionally overrides the integration default. Use
`0` for a notification at the due time, a larger value for an earlier warning,
or leave it empty to use the integration fallback.

### Complete JSON example

The Care Programs card imports either a JSON object containing a `templates`
array or a plain array. The following is a minimal complete template document
that can be edited externally and imported. A ready-to-use copy is available
at [`docs/examples/care-program-template-example.json`](examples/care-program-template-example.json):

```json
{
  "format": "puppy_tracker_care_templates",
  "version": 1,
  "templates": [
    {
      "name": "Rustige aanraking - 14 dagen",
      "title": "Rustige aanraking",
      "description": "Dagelijkse korte aanraking voor gewenning, met aandacht voor warmte en stresssignalen.",
      "record_type": "note",
      "schedule_type": "range",
      "start_age_days": 3,
      "end_age_days": 16,
      "interval_days": 1,
      "time_of_day": "09:00",
      "counts_for_attention": true,
      "notifications_enabled": true,
      "notification_lead_minutes": null,
      "result_fields": ["result", "note"],
      "instructions": "1. Neem de pup rustig op.\n2. Voer een korte aanraking uit.\n3. Observeer de reactie.\n4. Stop bij duidelijke stress en noteer de observatie.",
      "instructions_by_age": {
        "3": "Raak kort een pootje aan en houd de sessie zeer kort.",
        "4": "Herhaal rustig en voeg alleen een tweede korte aanraking toe.",
        "16": "Kies de rustige variant die bij deze pup het beste past."
      }
    }
  ]
}
```

The fields `id`, `revision`, `litter_id`, `created_at` and `updated_at` are
not needed when creating a new template. When editing a downloaded custom
template, keeping its `id` updates that template; removing it creates a new
template. IDs beginning with `builtin_` are reserved for the built-in starters
and are stripped or rejected during import.

### Checklist before importing

1. The title and name explain the protocol without relying on a specific nest.
2. The age range and interval produce exactly the intended occurrence days.
3. Every day-specific instruction uses an age inside the configured range.
4. The general instructions contain safety and stop conditions.
5. Result fields are limited to information that will actually be reviewed.
6. Attention and notification settings match the intended urgency.
7. Veterinary products, dosages and breed-specific claims are verified locally.

The complete import is validated before it is saved. If one template is
invalid, the batch is rejected and the existing templates remain unchanged.

## Derived status

The backend derives occurrence status by exact `care_occurrence_id` matching against active puppy dossier records. Current states are:

```text
completed
missed
overdue
due_today
upcoming
```

Frontend code must consume backend-derived status rather than inventing an alternative completion model.

## Today and Attention

Today and Attention show open age-based occurrences. Selecting an occurrence can record it as completed or missed and collect only the result fields enabled by the program.

After recording, the dossier becomes authoritative and the occurrence disappears from open-action views through normal backend status derivation. The frontend explicitly renders again after the refreshed occurrence response so a completed row cannot remain stale until a later dashboard update.

If an occurrence cannot be derived for a puppy, for example because `birth_time` is missing, the API returns a stable reason code and the frontend shows a warning instead of silently omitting that puppy.

## Notifications

Care notifications share the existing recurring-notification coordinator and shared `notify.*` delivery helper. There is no second polling/lifecycle engine.

Open `due_soon`, `due_today` and `overdue` occurrences are actionable for care delivery. A same-day occurrence with a configured future clock time remains `upcoming` until it enters the configured lead-time window.

Clocked upcoming occurrences become `due_soon` when their scheduled local time falls inside the configured notification lead-time window. Each program may define its own `notification_lead_minutes`; an empty value uses the integration-wide default from notification preferences. A value of 0 waits until the exact due time, while larger values allow earlier persistent/mobile reminders.

Delivery respects the general Puppy Tracker notification setting and each care program's own notification setting.

Related occurrences are grouped by program/age context so a litter does not receive one push per puppy. Delivery deduplication is occurrence-aware. Updating a persistent notification after some puppies complete an action must not resend already-delivered occurrences to mobile targets.

Current mobile deduplication state is runtime-only. An unresolved occurrence may therefore be delivered again after the integration/Home Assistant is restarted; reboot-persistent delivery deduplication is not part of the current contract.

## Reporting

Care outcomes are normal dossier records, so reporting reads the dossier rather than reconstructing results from reminder state. PDF reports include care-program results inside the selected report period, including age day, completed/missed status, structured result data, score and note where present.

## Diagnostics

Puppy Tracker diagnostics include privacy-safe scheduler health information:

- number of active stored care programs;
- number of quarantined care-program definitions;
- number of generic recurring reminders;
- number of quarantined recurring reminders.

Quarantine counts make preservation/compatibility problems visible without leaking the actual care configuration.

## Compatibility rules

Changes to age-based care programs must not silently alter:

- existing revision-1 occurrence IDs or dossier result matching;
- recurring-reminder interval/fixed-time/once semantics;
- owner-scope matching;
- mother identity;
- generic dossier timestamp meaning;
- backup formats without an explicit compatibility decision.

Automatic repair remains limited to cases where the intended result is unambiguous.

Care programs and user-owned care-program templates are stored separately from the main Puppy Tracker database. Backup format v5 carries both stores in the scheduler envelope. A full restore validates and replaces them as part of the coordinated multi-store transaction; rollback restores the previous definitions if another store fails. Built-in templates remain code-defined and are always available regardless of the restored user-template store. Partial litter and puppy exports do not include scheduler definitions or templates.

## Tests

Regression coverage protects at least:

- program normalization, record-type validation and revision validation;
- once/range occurrence derivation;
- revision-1 backward compatibility and revision-2+ deterministic IDs;
- Home Assistant local timezone/DST clock handling;
- same-day before/after configured-time status;
- missing birth-time handling and visible skipped-puppy warnings;
- dossier-backed completion and missed status;
- duplicate result prevention;
- exact puppy/occurrence isolation;
- protocol locking after active results;
- store quarantine and failed-write rollback;
- Today/Attention presentation contracts;
- browser E2E from open care row through result dialog, WebSocket save and immediate row removal;
- notification grouping and deduplication;
- notification lead-time fallback and per-program overrides;
- PDF care-result output and report-period filtering;
- diagnostics scheduler/quarantine counts.
