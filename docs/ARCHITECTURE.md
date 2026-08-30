# Puppy Tracker architecture

This document describes the architectural direction of Puppy Tracker during the pre-1.0 development cycle.

## Goal

Puppy Tracker is no longer designed as only a weight tracker. The target is a Home Assistant integration that can maintain a useful puppy and litter dossier while still providing specialised, high-quality weight tracking.

The architecture therefore separates:

1. profile data;
2. high-frequency specialised measurements;
3. chronological dossier records;
4. derived metrics/monitoring;
5. presentation through Home Assistant entities and custom cards.

## Integration identity

```text
Display name: Puppy Tracker
Domain:       puppy_tracker
Package:      custom_components/puppy_tracker
Storage key:  puppy_tracker
WebSocket:    puppy_tracker/*
```

The old prerelease `puppy_weight_tracker` identity is intentionally not retained as a compatibility layer because the project had not reached a stable public 1.0 contract.

## Core hierarchy

```text
PuppyTrackerStorage
└── litters[]
    └── Litter
        ├── profile fields
        ├── records[]
        ├── last_completed_session
        └── puppies[]
            └── Puppy
                ├── profile fields
                ├── profile_note
                ├── records[]
                └── measurements[]
```

## Why measurements remain separate

Weight measurements are time-series data with behaviour that generic dossier records do not need:

- current/previous value selection;
- 24-hour growth calculations;
- correction chains;
- soft-delete/restore semantics;
- birth-weight synchronisation;
- charts;
- frequent updates;
- monitoring thresholds.

Forcing weight measurements into the general record model would make both models harder to validate and maintain. The timeline UI may later *display* weight events, but the authoritative weight data remains in `measurements[]`.

## Profile note versus dossier note

A puppy has one `profile_note` for persistent summary information.

Examples:

```text
Calm puppy, white chest marking, smallest at birth.
```

A new chronological note is a dossier record and receives its own identity and timestamps.

```text
2026-08-30 10:42 — Drank goed na ochtendvoeding.
2026-08-30 18:15 — Nageltjes gecontroleerd.
```

Appending free text to one large profile field is intentionally avoided because it prevents reliable chronological filtering, editing, reporting and future categorisation.

## Dossier record envelope

Records use a generic outer structure with type-specific payload data.

```json
{
  "id": "uuid",
  "type": "vaccination",
  "scope": "puppy",
  "litter_id": "uuid",
  "puppy_id": "uuid",
  "occurred_at": "2026-09-10T12:30:00+00:00",
  "created_at": "2026-09-10T12:35:12+00:00",
  "updated_at": "2026-09-10T12:35:12+00:00",
  "deleted": false,
  "deleted_at": null,
  "title": "Puppy DP",
  "note": "Geen bijzonderheden",
  "data": {
    "batch": "ABC123"
  }
}
```

### Timestamp semantics

- `occurred_at`: when the real-world event happened.
- `created_at`: when the record was entered into Puppy Tracker.
- `updated_at`: last edit time.
- `deleted_at`: soft-delete time.

These fields must not be conflated. A vaccination entered two days later should still sort by the actual vaccination time when showing the puppy timeline.

## Record types

The initial model recognises concepts such as:

```text
note
vaccination
test
deworming
medication
vet_visit
milestone
other
```

The storage layer permits future validated snake_case record types so new modules do not require restructuring every stored puppy.

Type-specific validation belongs above the generic persistence layer. For example, a vaccination module can later require vaccine/product fields without making those fields mandatory for a generic note.

## Upcoming dossier actions

Upcoming dossier actions are derived from active dossier records. They are not
stored as a second persistent task model. The `upcoming.py` backend helper reads
known follow-up fields such as `vaccination.data.next_due_date` and
`deworming.data.next_due_date`, treats those values as local calendar dates, and
returns transient actions for dashboard cards and WebSocket payloads.

The first supported statuses are:

```text
overdue
due_today
upcoming
```

New record types can join this mechanism by adding a type configuration that
points to the relevant field inside `record["data"]`.

## Scope

Records can belong to either:

```text
scope = litter
scope = puppy
```

Puppy records always have a known litter owner as well. Ownership is validated by the integrity checker.

Examples of litter-scoped events:

- all puppies dewormed;
- whole-litter veterinary check;
- general litter observation.

Examples of puppy-scoped events:

- individual note;
- vaccination;
- test result;
- treatment;
- milestone.

## Soft deletion

Both measurement history and dossier records favour soft deletion. Historical data can therefore be restored and remains available for technical backups/audit purposes.

Automatic integrity repair follows a conservative rule:

> Repair automatically only when the intended result is unambiguous.

Duplicate IDs, ambiguous measurement branches or similarly uncertain corruption should be reported rather than guessed.

## Runtime state

Per-config-entry state is held in typed `ConfigEntry.runtime_data` using `PuppyTrackerRuntimeData` rather than arbitrary `hass.data[DOMAIN][entry_id]` dictionaries.

Global one-time registration flags, such as static frontend route registration, may still live in `hass.data` because they are Home Assistant instance state rather than integration-entry runtime state.

## Metrics layer

Weight calculations and monitoring status belong to shared domain logic, not Home Assistant sensor classes. Sensors, binary sensors, notifications, API and PDF reports consume the same canonical metric functions.

This avoids disagreement between:

```text
sensor state
websocket dashboard
notification
PDF report
```

## Time handling

Storage timestamps are timezone-aware. Measurement ordering is based on actual instants, not lexical ISO-string ordering.

Where timestamps are equal, deterministic tie-breakers are used (`created_at`, then stable identity where applicable).

User interfaces must preserve timestamp precision. Weight-only corrections must not modify the original measurement timestamp.

## Frontend API

Custom cards consume the integration's WebSocket API instead of re-deriving business logic from Home Assistant entity names.

Current namespace:

```text
puppy_tracker/*
```

The backend remains the source of truth for monitoring state, effective measurements and dossier data.

## Frontend cards

Current element namespace:

```text
custom:puppy-tracker-card
custom:puppy-tracker-overview-card
custom:puppy-tracker-summary-card
custom:puppy-tracker-attention-card
custom:puppy-tracker-litter-card
custom:puppy-tracker-report-card
custom:puppy-tracker-dossier-card
```

The dossier card uses the same API and record model rather than inventing card-local storage conventions.

## Export philosophy

- CSV is an analysis-friendly view of effective measurement data.
- JSON is the complete technical backup format.
- PDF is a user-facing report.

Future dossier reporting should preserve that distinction: JSON retains full technical history; user-facing reports select meaningful events for the requested puppy, litter and period.

## Testing strategy

Regression tests live under `tests/` and protect behaviour that could silently alter data meaning.

Critical areas include:

- timezone ordering;
- timestamp precision;
- measurement correction chains;
- delete/restore;
- birth-weight synchronisation;
- monitoring metrics;
- integrity repairs;
- dossier record ownership and CRUD;
- upcoming action derivation;
- export selection;
- runtime selection.

Browser/iOS behaviour still requires manual or future end-to-end testing because backend pytest tests do not exercise Lovelace/WKWebView behaviour.

## Future modules

The dossier envelope is intended to support modules such as:

### Vaccinations

Possible payload fields:

```text
vaccine/product
batch/lot
veterinarian
next_due_date
```

### Tests

Possible payload fields:

```text
test_type
result
status
laboratory
reference
```

### Deworming / medication

Possible payload fields:

```text
product
amount
dose/unit
route
next_due_date
```

### Veterinary visits

Possible payload fields:

```text
clinic/veterinarian
reason
outcome
follow_up
```

### Milestones

Possible payload fields:

```text
category
observation
```

These are direction-setting examples, not frozen schemas. Type-specific schemas should be added only when the corresponding feature is implemented and tested.

## Pre-1.0 rule

The pre-1.0 period is the time to correct naming and architecture. Once 1.0 is released, domain names, entity identities, storage contracts and dashboard element names should be treated as compatibility-sensitive public interfaces.
