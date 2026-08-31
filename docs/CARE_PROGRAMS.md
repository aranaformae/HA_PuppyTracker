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

A program may also define an optional local time of day.

The calendar is anchored to puppy age. Completing or missing one occurrence never changes the schedule of another occurrence.

## Per-puppy occurrence identity

Occurrences are derived for active puppies with a valid `birth_time`. Missing birth time is reported/skipped rather than guessed.

Occurrence identity is deterministic from:

```text
program_id + puppy_id + age_days
```

This is a critical invariant. ENS day 7 for puppy A is a different occurrence from ENS day 7 for puppy B and from ENS day 8 for puppy A.

## Completion and results

Completion is dossier-backed. Recording an occurrence creates a normal puppy dossier record containing stable care metadata, including the program ID, occurrence ID, age day, scheduled time, completion/missed status and configured structured result data.

The scheduled timestamp and actual event timestamp have different meanings. `care_scheduled_at` records the planned occurrence. `occurred_at` remains the real event/registration time and must not be rewritten to make a late action appear on time.

Current result capabilities include optional result, score and note fields plus extensible structured care data.

A second active result for the same `care_occurrence_id` is rejected. Soft-deleted dossier records do not count as completion.

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

After recording, the dossier becomes authoritative and the occurrence disappears from open-action views through normal backend status derivation.

## Notifications

Care notifications share the existing recurring-notification coordinator and shared `notify.*` delivery helper. There is no second polling/lifecycle engine.

Only open `due_today` and `overdue` occurrences are actionable for care delivery. Delivery respects the general Puppy Tracker notification setting and each care program's own notification setting.

Related occurrences are grouped by program/age context so a litter does not receive one push per puppy. Delivery deduplication is occurrence-aware. Updating a persistent notification after some puppies complete an action must not resend already-delivered occurrences to mobile targets.

## Reporting

Care outcomes are normal dossier records, so reporting reads the dossier rather than reconstructing results from reminder state. PDF reports include care-program results inside the selected report period, including age day, completed/missed status, structured result data, score and note where present.

## Compatibility rules

Changes to age-based care programs must not silently alter:

- recurring-reminder interval/fixed-time/once semantics;
- owner-scope matching;
- mother identity;
- generic dossier timestamp meaning;
- backup formats without an explicit compatibility decision.

Automatic repair remains limited to cases where the intended result is unambiguous.

## Tests

Regression coverage should protect at least:

- program normalization and validation;
- once/range occurrence derivation;
- deterministic per-puppy IDs;
- missing birth-time handling;
- dossier-backed completion and missed status;
- duplicate result prevention;
- exact puppy/occurrence isolation;
- Today/Attention presentation contracts;
- notification grouping and deduplication;
- PDF care-result output and report-period filtering.
