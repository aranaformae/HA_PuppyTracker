# Age-based care programs

This document defines the architectural contract for Puppy Tracker age-based litter care programs.

## Purpose

Age-based care programs schedule actions from each puppy's age. They are intentionally separate from generic recurring reminders: a late or missed age-based action must never shift later occurrences.

Examples include ENS over days 3–17, ESI over days 5–17 and a one-time deworming action at a configured age.

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

Changing one of these fields before any result exists increments the program revision. Operational toggles such as `enabled` and `notifications_enabled`, and presentation-only `description`, do not change occurrence identity.

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

Only open `due_today` and `overdue` occurrences are actionable for care delivery. A same-day occurrence with a configured future clock time is still `upcoming` and must not notify early.

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

Care programs are stored separately from the main Puppy Tracker database. Their inclusion in technical backup/restore therefore requires an explicit backup-version contract and ID-remapping rules; it must not be assumed merely because care results themselves already live in the dossier.

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
- PDF care-result output and report-period filtering;
- diagnostics scheduler/quarantine counts.
