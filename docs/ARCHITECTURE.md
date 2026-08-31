# Puppy Tracker architecture

This document describes the architectural direction and current pre-1.0 contracts of Puppy Tracker.

## Goal

Puppy Tracker is a Home Assistant integration for maintaining litter, mother-dog and puppy care data while retaining specialised, high-quality puppy weight tracking.

The architecture separates:

1. reusable profile/owner data;
2. high-frequency specialised measurements;
3. chronological dossier records;
4. derived metrics and dossier follow-up actions;
5. persistent generic recurring-care rules;
6. notification delivery state;
7. presentation through Home Assistant devices/entities and custom cards.

## Integration identity

```text
Display name: Puppy Tracker
Domain:       puppy_tracker
Package:      custom_components/puppy_tracker
Storage key:  puppy_tracker
WebSocket:    puppy_tracker/*
```

The old prerelease `puppy_weight_tracker` identity is intentionally not retained as a compatibility layer.

## Core hierarchy

```text
PuppyTrackerStorage
├── mothers[]
│   └── Mother
│       ├── profile fields
│       └── records[]
└── litters[]
    └── Litter
        ├── profile fields
        ├── mother reference/context
        ├── records[]
        ├── last_completed_session
        └── puppies[]
            └── Puppy
                ├── profile fields
                ├── profile_note
                ├── records[]
                └── measurements[]

RecurringReminderStore
└── reminders{}
```

The recurring reminder store is intentionally separate from the main dossier storage. Dossier records describe facts that happened; reminder definitions describe future scheduling rules.

## Owner scopes

Care data and recurring reminders use explicit ownership. Current logical scopes are:

```text
litter
mother
puppy
```

A litter-scoped record/action belongs to the whole nest. A puppy-scoped record belongs to one puppy within a known litter. A mother-scoped record belongs to a persistent mother profile and carries litter context where appropriate.

Ownership is not inferred from display names. IDs are authoritative.

### Mother identity

A mother dog is a reusable first-class owner, not merely a string copied into each litter. The same mother can therefore participate in multiple litters while keeping one persistent identity and dossier.

Frontend code must resolve mother identity through the mother-scope API/storage contract. It must not assume that the normal litter dashboard payload contains a directly usable `mother_id`. This rule prevents cards from disagreeing about whether a mother exists.

Mother devices are top-level Home Assistant devices rather than children of one litter because one mother can span multiple litters.

## Why measurements remain separate

Weight measurements are time-series data with behaviour generic dossier records do not need:

- current/previous value selection;
- normalised 24-hour growth calculations;
- correction chains;
- soft-delete/restore semantics;
- birth-weight synchronisation;
- charts;
- frequent updates;
- monitoring thresholds.

The Timeline may display weight events beside dossier records, but authoritative weight data remains in `measurements[]`.

## Dossier record envelope

Records use a generic outer structure with type-specific payload data. Important timestamp semantics remain:

- `occurred_at`: when the real-world event happened;
- `created_at`: when it was entered;
- `updated_at`: last edit time;
- `deleted_at`: soft-delete time.

These values must not be conflated because timeline ordering and reminder completion depend on the real occurrence time.

Current record concepts include:

```text
note
temperature
vaccination
test
deworming
medication
vet_visit
milestone
other
```

Temperature is a structured dossier event. Its Celsius value belongs in record data rather than being encoded only into title/note text.

The storage layer remains extensible for future validated snake_case record types.

## Profile note versus dossier record

A puppy has one editable `profile_note` for persistent summary information. Chronological observations are separate dossier records with their own identities and timestamps. This preserves filtering, editing, reporting and future categorisation.

## Derived upcoming dossier actions

`upcoming.py` derives follow-up actions from active dossier records, for example vaccination/deworming `next_due_date` fields. These actions are transient projections and are not stored as a second task database.

Typical statuses are:

```text
overdue
due_today
upcoming
```

Mother records can participate in the same attention surface when their record type contains a supported follow-up field.

## Generic recurring reminders

Recurring reminders are a separate persistent scheduling mechanism for repetitive or one-time care. They are generic by design and are not specific to temperature, medication or weighing.

Authoritative implementation lives in:

```text
recurring_reminders.py
recurring_reminder_api.py
recurring_notifications.py
```

### Reminder envelope

A normalized reminder contains at least:

```text
id
enabled
title
owner_scope
owner_id
litter_id
record_type
match_title
schedule_mode
interval_minutes
fixed_times
start_at
due_at
last_completed_at
last_completed_record_id
created_at
updated_at
```

Valid owner scopes:

```text
litter
mother
puppy
```

Valid schedule modes:

```text
interval
fixed_times
once
```

For litter ownership, `owner_id` normalizes to the litter ID. Mother and puppy reminders require an explicit persistent owner ID.

### Completion matching

A dossier record completes a reminder only when all required conditions match:

1. reminder is enabled;
2. record is active/not deleted;
3. record type equals `record_type`;
4. optional `match_title` matches exactly after normalized case handling;
5. litter context matches;
6. owner scope matches;
7. owner ID matches;
8. the record occurrence is newer than the previously completed occurrence.

This exact-owner rule is a critical invariant. A puppy temperature cannot complete a mother temperature reminder and neither can complete a whole-litter reminder.

### Interval schedules

For `interval`, the next due time is:

```text
(last_completed_at OR start_at) + interval_minutes
```

This deliberately makes the schedule follow the actual completion time. A late action shifts the next interval instead of accumulating artificial lateness from an old planned time.

### Fixed-time schedules

`fixed_times` contains normalized `HH:MM` local-clock values. Fixed schedules preserve the timezone represented by the caller/Home Assistant local time. They must not be silently converted through an unrelated process-default timezone before constructing the wall-clock candidate.

### One-time schedules

`once` uses `due_at`. Once a matching dossier record sets `last_completed_at`, there is no next due occurrence.

### Derived reminder status

Reminder status is calculated, not persisted as authoritative state:

```text
completed
disabled
upcoming
due_soon
overdue
```

`due_soon` currently represents the final 60 minutes before the deadline.

## Notification architecture

Recurring reminder notifications are a delivery projection over reminder state, not part of reminder scheduling itself.

The notification manager:

- reconciles reminder completion before evaluating status;
- checks periodically (currently every 10 minutes);
- reacts to Puppy Tracker dashboard update signals;
- creates Home Assistant persistent notifications for `due_soon`/`overdue` states when recurring-reminder delivery is enabled;
- optionally sends the same content to configured `notify.*` entities;
- deduplicates on reminder ID plus status/next-due state;
- dismisses stale persistent notifications when a reminder is no longer actionable.

Automatic recurring-reminder delivery is controlled by the independent `recurring_reminder_notifications_enabled` setting rather than the general `notifications_enabled` switch. The key is part of the official main-storage settings contract: it is present in `_default_settings()` and is persisted through `PuppyTrackerStorage.async_update_settings()`. Older stores that do not contain the key receive the default during normal `async_load()` migration without changing reminder data or the storage schema version.

Notification controls are presented centrally through the options flow. Monitoring thresholds remain under monitoring settings; notification preferences contain the general Puppy Tracker notification toggle, recurring-reminder delivery toggle, recovery/session-complete preferences and shared `notify.*` targets.

`notification_delivery.py` provides the shared `notify.*` delivery path used by automatic recurring reminders and explicit test notifications. Automatic reminder delivery remains best-effort so one unavailable target does not interrupt reminder reconciliation. Explicit tests use strict delivery so service/target failures are surfaced to the initiating options flow.

Dashboard due-state calculation must remain useful when notifications are disabled. Notification delivery must never be required for scheduling or completion.

### Test notification contract

The notification settings expose an explicit **Send test notification** action. Its purpose is to verify the configured delivery path without manipulating a real reminder.

A test notification:

- uses the same configured `notify.*` targets and shared delivery helper as real recurring-reminder delivery;
- is clearly identified as a test;
- can be sent on demand without waiting for a reminder to become `due_soon` or `overdue`;
- is allowed even when automatic recurring-reminder notifications are disabled;
- bypasses normal reminder delivery deduplication so repeated manual tests are possible;
- does not create or alter a reminder;
- does not change `last_completed_at`, `last_completed_record_id`, `next_due_at` or any reminder schedule state;
- does not mark a dossier action complete;
- reports delivery/configuration errors back to the initiating UI/config flow rather than silently swallowing them.

The dedicated recurring-reminder notification enable/disable preference and the test action are related but distinct. The enable toggle controls automatic reminder delivery; the explicit test action verifies the selected path on demand.

## Runtime state

Per-config-entry state is held in typed `ConfigEntry.runtime_data` using `PuppyTrackerRuntimeData`. Persistent recurring reminders are represented by their own Home Assistant `Store` (`puppy_tracker_recurring_reminders`, version 1) and attached to runtime data for API/notification access.

Global one-time registration flags may live in `hass.data` when they represent Home Assistant instance state rather than entry-owned domain data.

## Metrics layer

Weight calculations and monitoring status belong to shared domain logic, not sensor classes. Sensors, binary sensors, notifications, WebSocket APIs and reports consume canonical metric functions.

## Time handling

Storage timestamps are timezone-aware. Ordering is based on actual instants, with deterministic tie-breakers where needed.

User interfaces must preserve timestamp precision. Weight-only corrections must not modify the original measurement timestamp. Reminder fixed-time schedules must preserve local wall-clock intent.

## Frontend API

Custom cards consume `puppy_tracker/*` WebSocket APIs rather than re-deriving domain relationships from Home Assistant entity names.

The backend remains source of truth for monitoring state, effective measurements, dossier data, mother identity, recurring reminder definitions and derived status.

Frontend compatibility layers may enrich presentation, but must not invent a second persistence model.

## Frontend surfaces

Current core element namespace includes:

```text
custom:puppy-tracker-card
custom:puppy-tracker-overview-card
custom:puppy-tracker-summary-card
custom:puppy-tracker-attention-card
custom:puppy-tracker-litter-card
custom:puppy-tracker-report-card
custom:puppy-tracker-dossier-card
custom:puppy-tracker-quick-log-card
custom:puppy-tracker-bulk-dossier-card
custom:puppy-tracker-timeline-card
custom:puppy-tracker-recurring-reminder-card
```

Mother scope is expected on Dossier, Quick Log, Timeline, Attention, Report/export and Recurring Reminders where the workflow logically supports a single owner. Bulk Dossier remains puppy-oriented because its purpose is one event applied to multiple puppies.

The recurring-reminder card must resolve the linked mother through the mother scope rather than requiring `litter.mother_id` in the ordinary litter payload.

## Export philosophy

- CSV is an analysis-friendly view of effective measurement data.
- JSON is the complete technical backup/transfer format.
- PDF is a user-facing report.
- Mother dossier JSON export preserves persistent mother identity and can be filtered by litter context.

Recurring-reminder backup/restore compatibility should be treated explicitly because reminders are stored separately from the main Puppy Tracker database. New backup schema work must decide whether reminder definitions are portable and how owner IDs are remapped during partial imports rather than silently assuming main-storage semantics.

Adding a notification preference to the existing main `settings` dictionary does not by itself change the backup envelope: full backups already carry the settings dictionary as data, and normal storage loading backfills missing defaults. Changes to reminder definitions, owner identifiers or reminder-store portability remain separate compatibility decisions.

## Soft deletion and integrity

Measurement history and dossier records favour soft deletion. Historical data remains available for restore/audit/technical backup.

Automatic integrity repair follows the rule:

> Repair automatically only when the intended result is unambiguous.

Duplicate IDs, ambiguous measurement branches and uncertain ownership must be reported rather than guessed.

## Testing strategy

Regression tests should protect data meaning and cross-surface contracts, including timezone ordering and precision, measurement correction chains, birth-weight synchronisation, monitoring metrics, dossier ownership/CRUD, mother identity resolution across cards, temperature structured-data rendering, upcoming action derivation, recurring reminder normalization, interval/fixed-time/once scheduling, fixed-time timezone behaviour, exact owner matching, notification settings persistence/default migration, notification deduplication, test-notification state isolation and error propagation, frontend module load order, export selection and runtime selection.

Manual release testing should additionally cover HACS upgrade, browser refresh/cache behaviour, phone/tablet interaction, mother selection, reminder completion from real dossier logging, notification-off production testing, explicit test-notification delivery and restart persistence.

## Future modules and extension rules

The generic dossier envelope and recurring-reminder engine should support future workflows such as medication courses, feeding, veterinary follow-up, tests and milestones without creating parallel per-feature task engines.

New care features should prefer:

```text
structured dossier record
        +
optional recurring reminder rule
        +
derived attention/notification projection
```

over feature-specific persistent reminder databases.

Type-specific schemas should be added only when the corresponding feature is implemented and tested.

## Pre-1.0 rule

The pre-1.0 period is the time to correct naming and architecture. Once 1.0 is released, domain names, entity identities, storage contracts, owner-scope semantics, WebSocket message shapes and dashboard element names should be treated as compatibility-sensitive public interfaces.
