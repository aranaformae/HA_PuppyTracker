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
6. persistent age-based litter care program definitions;
7. derived care/reminder status and notification delivery state;
8. presentation through Home Assistant devices/entities and custom cards.

A central rule is that persistent scheduling definitions and historical facts are different data classes. A reminder or care program may say what should happen; a dossier record says what actually happened.

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

AgeBasedCareProgramStore
└── programs{}

CareProgramTemplateStore
└── user-owned templates{}

OwnerStore
└── reusable owner/contact profiles{}
```

The recurring-reminder, age-based-care and care-template stores are intentionally separate from the main dossier storage. Owner/contact profiles are also reusable records outside the puppy profile. Dossier records describe facts that happened; scheduling definitions and templates describe future rules or reusable configuration. Derived reminder/care occurrences are projections and are not persisted as a second task database.

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

### Per-litter growth analysis configuration

Growth monitoring has global defaults, with optional per-litter overrides stored in
the litter record under `growth_analysis`. Missing or empty overrides resolve to
the global integration settings, preserving the behaviour of existing litters.
The initial configuration envelope supports minimum daily growth, maximum time
between weighings, monitoring age, first-day maximum loss, an optional expected
adult-weight range and descriptive `breed_profile`/`size_class` metadata.

The derived `growth_analysis` summary also compares the latest change with the
recent series. A sufficiently large isolated jump is returned as a data-quality
hint (`possible_input_error`), so the UI can ask for a scale/input check without
pretending to diagnose the puppy.

When at least two active puppies in a litter have a current measurement, the
summary also includes `litter_comparison`: measured sample size, descending
weight rank, litter median, percentage difference from that median and a coarse
`below_median`/`near_median`/`above_median` position. The comparison is a
contextual within-litter signal only. It does not account for sex, birth order,
parent size, breed curve or veterinary condition, and it must not be presented
as a diagnosis. A current measurement is required for every puppy included in
the comparison; missing or stale historical values are not substituted.

The same summary includes `weight_pattern`, which marks `sustained_loss` after
two consecutive negative measurement changes. This is deliberately separate
from the canonical single-step monitoring status: one temporary decrease can be
shown as a normal weight-loss status, while the overview can still identify a
repeated downward pattern for manual review.

The summary also marks `sustained_low_growth` after two consecutive normalized
growth periods fall below the active per-litter minimum, but only while growth
monitoring is active for the puppy. This avoids turning a single noisy interval
or an age outside the configured monitoring window into a persistent warning.

When at least two puppies have a usable normalized daily-growth sample, the
summary also exposes `litter_growth_comparison`. It uses the median daily-growth
percentage, descending tempo rank and the difference in percentage points from
that median. A two-point context tolerance labels the result as below, near or
above the nest tempo. This is a relative monitoring aid and is not a breed
standard, adult-weight prediction or medical threshold.

For puppies with at least three valid growth intervals, `growth_variability`
reports the minimum and maximum normalized daily growth, their spread in
percentage points and the median absolute deviation. These are descriptive
quality/context values; no universal cutoff is used because weighing cadence,
scale precision and neonatal circumstances can materially affect the spread.

`measurement_cadence` describes the valid timestamp intervals in the effective
series, including the median, shortest, longest and latest interval. It is
reported as context for interpreting growth and data quality; it does not alter
the canonical due-weighing calculation.

`birth_weight_recovery` compares the latest effective weight with the puppy's
recorded `birth_weight`, returning the absolute difference, percentage of birth
weight and a boolean `regained` value. It is a factual milestone for the
overview and deliberately has no age-based deadline or breed-specific meaning.

`growth_milestones` contains the configured birth-weight percentage targets,
their target grams, actual first crossing timestamps and an optional
`estimated_at` timestamp. Estimates use only the current normalized positive
growth rate and are omitted when growth is zero, negative or unavailable. The
200% target carries a fixed 14-day reference deadline from `birth_time` as a
monitoring aid; it is not a clinical rule and does not replace the normal
monitoring statuses.

Breed metadata is not a clinical model. In particular, Labradoodle is not treated
as one universal growth curve; `australian_labradoodle` and its miniature/medium/
standard size classes are only labels for later analysis unless validated data is
added explicitly.

The Timeline may display weight events beside dossier records, but authoritative weight data remains in `measurements[]`.

The Overview card keeps analysis data available independently of presentation.
Per-card options `show_advanced_analysis`, `show_growth_milestones` and
`show_milestone_chart_annotations` control detail panels, milestone progress
rows and chart annotations respectively. They default to enabled for backward
compatibility, and are presentation-only options that do not affect metrics,
storage or other card instances.

## Dossier record envelope

Records use a generic outer structure with type-specific payload data. Important timestamp semantics remain:

- `occurred_at`: when the real-world event happened;
- `created_at`: when it was entered;
- `updated_at`: last edit time;
- `deleted_at`: soft-delete time.

These values must not be conflated because timeline ordering, reports and reminder completion depend on the real occurrence time.

Current record concepts include:

```text
note
feeding
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

Feeding is also a structured dossier event. Its optional `feeding_type`, `amount`, `unit` and `observation` values belong in record data and are available from both Dossier and Quick Log. Legacy free-text feeding notes remain valid and are not migrated automatically.

### Changing dossier ownership

The Dossier card can move a record between the literal `litter`, `mother` and `puppy` scopes within the selected litter. This operation removes the record from its current owner list, updates its scope and owner references, and appends it to the destination owner list in one save operation. It preserves the record identity and audit history, so the action is a move rather than a duplicate. Mother moves require the litter's linked persistent mother; puppy moves require an explicit puppy ID. The storage layer rejects mismatched scope/ID combinations at its boundary.

The storage layer remains extensible for future validated lowercase snake_case record types. Scheduling layers must validate record types at their persistence boundary rather than allowing invalid types to enter their own stores.

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
notification_lead_minutes
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

`due_soon` represents the configured notification lead-time window before the deadline. A reminder-level `notification_lead_minutes` value overrides the integration default; an empty value uses the global fallback from main storage settings. Valid lead times are 0 through 10080 minutes.

### Recurring-reminder store integrity

The reminder store uses conservative persistence semantics:

- record types and schedule timestamps are validated during normalization;
- unreadable/future definitions are preserved in quarantine instead of silently deleted;
- unchanged records retain their existing `updated_at` values when loaded;
- create/update/delete mutations roll back in-memory state if the Home Assistant store write fails.

Diagnostics expose aggregate reminder and quarantine counts without exposing reminder contents.

## Age-based litter care programs

Age-based care programs schedule actions from each puppy's age. They are different from interval reminders because completion timing must never shift the age calendar.

Authoritative implementation lives in:

```text
care_programs.py
care_occurrences.py
care_status.py
care_results.py
care_program_api.py
care_notifications.py
```

The full contract is documented in [`CARE_PROGRAMS.md`](CARE_PROGRAMS.md).

### Persistent definition, derived occurrence, dossier fact

The model is:

```text
persistent care program definition
        ↓
derived occurrence per puppy and age day
        ↓
structured puppy dossier result
```

Only the program definition is stored in the dedicated care-program store. Concrete occurrences are re-derived from puppy `birth_time`, program revision and schedule fields. Completion/missed state is derived by exact dossier `care_occurrence_id` matching.

### Schedule semantics

Supported modes are:

```text
once
range
```

A range is inclusive from `start_age_days` through `end_age_days` with `interval_days`. The optional `time_of_day` is Home Assistant local wall-clock time on the target age date. Target-date timezone/DST rules apply.

A clocked same-day occurrence remains `upcoming` before its configured time, becomes `due_today` at that time and becomes `overdue` only after the scheduled local date/time has passed. An unclocked occurrence is due for its whole local calendar day.

### Revision-aware occurrence identity

Program definitions have a positive `revision`.

Revision 1 keeps the original v0.17.0 identity:

```text
program_id:puppy_id:age_days
```

Later revisions use:

```text
program_id:rREVISION:puppy_id:age_days
```

This preserves historical v0.17.0 result matching while isolating genuinely changed protocols.

Fields that define occurrence/result meaning include title, record type, schedule mode/ages/interval, local time and enabled result fields. Before results exist, changing identity fields increments the revision. Once any active result exists, identity-changing edits are rejected and a new program must be created instead. Operational `enabled`/notification toggles and presentation description remain editable because they do not redefine historical occurrences.

### Result semantics

A care result is a normal puppy dossier record. Its structured data includes the originating program/revision, exact occurrence ID, puppy age day, planned `care_scheduled_at`, status and configured result fields.

`care_scheduled_at` is the planned schedule instant. `occurred_at` is the actual execution/registration instant. The latter must not be rewritten merely to make a late result look on time.

A second active result for the same occurrence is rejected. Soft-deleted results no longer complete the occurrence.

The result WebSocket endpoint re-derives the occurrence from authoritative backend state rather than trusting arbitrary schedule metadata from the client.

### Missing source data

An active puppy whose occurrence cannot be derived, for example because `birth_time` is missing, must not disappear silently. The API returns a stable reason code and Today/Attention presents a warning.

### Care-program store integrity

Age-based program persistence follows the same conservative pattern as recurring reminders:

- invalid definitions are rejected at the storage boundary;
- old definitions without revision migrate to revision 1;
- unreadable/future definitions are quarantined rather than deleted;
- unchanged timestamps are preserved during load;
- failed writes roll in-memory state back.

Diagnostics expose aggregate program and quarantine counts.

### Care-program templates

`CareProgramTemplateStore` contains only user-owned templates. Built-in ENS, ESI,
deworming and neonatal-check templates are code-defined read-only starters and
are merged into the list returned to the frontend. A template contains the
program fields needed to create a litter care program, including optional
`instructions_by_age` for day-specific guidance.

The frontend can save a program as a template, download templates as a
`puppy_tracker_care_templates` JSON document and import a complete template
batch. Imported definitions pass the same normalization as care programs before
they are persisted. Batch persistence is all-or-nothing; invalid input or a
failed Home Assistant Store write leaves the previous template set unchanged.
Creating a program copies template values, so later template changes do not
rewrite existing programs.

User templates are included in full backup format v5 and restored as part of the
coordinated scheduler transaction. Partial litter/puppy transfers omit them.

### Reusable owner/contact profiles

`OwnerStore` contains reusable contact records. Puppies store an `owner_ids`
reference list rather than embedding personal data, which allows contacts to be
created and edited before a puppy is selected for placement. Owner records carry
contact details plus role, placement status/date, payment status/date and notes.
Full v5 backups include the owner store; partial transfers omit it because
references cannot be remapped safely without an explicit owner-transfer flow.
The owner's microchip value is a separate puppy `chip_number` text field and is
not part of owner/contact storage.

## Notification architecture

Notification delivery is a projection over authoritative monitoring/reminder/care state. Delivery state must never become scheduling truth.

The shared recurring notification coordinator:

- reconciles generic reminder completion before evaluating status;
- checks periodically (currently every 10 minutes);
- reacts to Puppy Tracker dashboard update signals;
- creates Home Assistant persistent notifications for actionable states;
- optionally sends content to configured `notify.*` entities;
- dismisses stale persistent notifications when an item is no longer actionable.

Generic recurring reminders and age-based care share the same coordinator lifecycle and shared `notification_delivery.py` helper rather than creating a second polling engine.

### Generic reminder notification settings

Automatic generic recurring-reminder delivery is controlled by the independent `recurring_reminder_notifications_enabled` setting rather than the general `notifications_enabled` switch. The key is part of the official main-storage settings contract and older stores receive the default during normal load migration without changing reminder data or the storage schema version.

Notification controls are presented centrally through the options flow. Monitoring thresholds remain under monitoring settings; notification preferences contain the general Puppy Tracker notification toggle, the default notification lead time, recurring-reminder delivery toggle, recovery/session-complete preferences and shared `notify.*` targets.

The default `notification_lead_minutes` setting is part of the main-storage settings contract and is backfilled for older stores without a schema-version bump. Scheduler definitions can optionally carry their own `notification_lead_minutes`; `None` means the integration default applies.

### Age-based care notifications

Age-based care delivery requires both the general Puppy Tracker notification setting and the program's own `notifications_enabled` setting.

Open `due_soon`, `due_today` and `overdue` age-based occurrences are actionable for care delivery. Clocked upcoming occurrences enter `due_soon` when their scheduled local time falls inside the program-specific lead time, or the integration default when the program value is empty. Related puppy occurrences are grouped by program/age context instead of producing one push per puppy.

Mobile care-delivery deduplication is currently runtime-only. An unresolved occurrence may be delivered again after integration/Home Assistant restart; reboot-persistent delivery deduplication is not currently an architectural guarantee.

### Delivery helper and test notifications

`notification_delivery.py` provides the shared `notify.*` delivery path. Automatic delivery remains best-effort so one unavailable target does not interrupt reconciliation. Explicit test notifications use strict delivery so service/target failures are surfaced to the initiating options flow.

Dashboard due-state calculation must remain useful when notifications are disabled. Notification delivery must never be required for scheduling or completion.

A test notification:

- uses the configured targets and shared delivery helper;
- is clearly identified as a test;
- can be sent on demand without waiting for a reminder;
- is allowed even when automatic recurring-reminder notifications are disabled;
- bypasses normal delivery deduplication;
- does not create, complete or alter a reminder/action;
- does not change schedule state;
- reports delivery/configuration errors back to the initiating flow.

## Runtime state

Per-config-entry state is held in typed `ConfigEntry.runtime_data` using `PuppyTrackerRuntimeData`.

Persistent rule stores attached to runtime data include:

```text
puppy_tracker_recurring_reminders  (Store version 1)
puppy_tracker_care_programs        (Store version 1)
puppy_tracker_care_program_templates (Store version 1)
puppy_tracker_owners               (Store version 1)
```

The main `PuppyTrackerStorage` remains authoritative for profiles, litters, measurements, dossier records and settings.

Global one-time registration flags may live in `hass.data` when they represent Home Assistant instance state rather than entry-owned domain data. Ephemeral notification-delivery deduplication may also live in runtime/instance state but must not be mistaken for persistent scheduling data.

## Metrics layer

Weight calculations and monitoring status belong to shared domain logic, not sensor classes. Sensors, binary sensors, notifications, WebSocket APIs and reports consume canonical metric functions.

## Time handling

Storage timestamps are timezone-aware. Ordering is based on actual instants, with deterministic tie-breakers where needed.

User interfaces must preserve timestamp precision. Weight-only corrections must not modify the original measurement timestamp.

Generic fixed-time reminders and age-based care `time_of_day` values represent local wall-clock intent. They must use the intended Home Assistant/caller timezone and target-date DST rules rather than being reconstructed through an unrelated process timezone or a stale source-date UTC offset.

Date-only dossier follow-up fields remain local calendar dates and must not shift by accidental UTC conversion.

## Frontend API

Custom cards consume `puppy_tracker/*` WebSocket APIs rather than re-deriving domain relationships from Home Assistant entity names.

The backend remains source of truth for monitoring state, effective measurements, dossier data, mother identity, recurring reminder definitions/status, care program definitions, care occurrence status and completion.

Frontend compatibility layers may enrich presentation, but must not invent a second persistence model.

## Frontend surfaces

Current core element namespace includes:

```text
custom:puppy-tracker-card
custom:puppy-tracker-overview-card
custom:puppy-tracker-summary-card
custom:puppy-tracker-today-card
custom:puppy-tracker-attention-card
custom:puppy-tracker-care-program-card
custom:puppy-tracker-care-execution-card
custom:puppy-tracker-recurring-reminder-card
custom:puppy-tracker-litter-card
custom:puppy-tracker-report-card
custom:puppy-tracker-dossier-card
custom:puppy-tracker-quick-log-card
custom:puppy-tracker-mobile-card
custom:puppy-tracker-bulk-dossier-card
custom:puppy-tracker-timeline-card
custom:puppy-tracker-temperature-card
```

Mother scope is expected on Dossier, Quick Log, Timeline, Attention, Report/export and Recurring Reminders where the workflow logically supports a single owner. Bulk Dossier remains puppy-oriented because its purpose is one event applied to multiple puppies.

The Temperature card is a focused temperature workflow. It reads structured `temperature` dossier records, supports litter, mother and puppy scope, offers a configurable history range, renders a compact SVG trend view and writes new readings through the same dossier APIs as the other cards. It is an additional presentation surface, not a separate temperature store. Its history height and row limit are configurable so the card remains usable on phones and tablets.

The recurring-reminder card must resolve the linked mother through the mother scope rather than requiring `litter.mother_id` in the ordinary litter payload.

Presentation density is configured per Lovelace card instance. The Overview card exposes independent switches for advanced analysis, growth milestones and chart annotations. The Litter card uses `show_details` to control secondary growth columns and expandable per-puppy metadata; all of these options default to the current detailed presentation for backward compatibility.

Milestone projection is derived presentation data. The per-litter `milestone_projection_measurements` setting selects 2 to 8 recent valid growth periods, with 4 as the default. The backend returns the mean daily growth, an uncertainty range, a confidence level and an irregular-cadence flag; the original single-date estimate remains available for clients that only understand `estimated_at`.

### Configurable initial card scope

Dossier, Timeline, Temperature and Quick Log accept a presentation-only
`default_selected` card option (with `default_scope` retained as a backwards-
compatible alias) with
the values `all`, `litter`, `mother` and `puppy`. The option controls the scope
used during the initial load; the interactive scope selector remains available
and changing it does not change persisted data. A configured `puppy_id` selects
that puppy directly, and `default_selected` takes precedence when both options
are present. The aggregate
`all` view combines litter and mother records where supported, while a
mother-scoped dossier view is read-only because it is a history surface rather
than an editing operation. Quick Log deliberately keeps an explicit single
owner selection because applying an aggregate default to a new log entry could
store the action under the wrong owner.

Today and Attention consume backend-derived age-based occurrence status. Recording a care result must refresh occurrences and render the refreshed state immediately; a completed row must not remain stale until another dashboard event.

### Shared category filtering and list presentation

The Timeline, Today and Attention surfaces use type/category chips as a presentation
filter over the already-derived backend data. The filter is inclusive: selecting
`All` selects every type currently available on that surface, and clearing every
type is a valid state that renders no matching items. The filter must not delete,
acknowledge, complete or otherwise mutate records or occurrences. Temperature and
age-based care types must be offered when present, so they cannot disappear merely
because they are not part of an older static type list.

Attention keeps open and acknowledged items in independently scrollable lists with
a maximum height of 520px. Today applies the same maximum to its combined activity
area. Timeline retains its category filters even when timeline items are configured
to start hidden; `show_timeline_items` controls the initial presentation only and
does not remove the control or change the underlying data.

## Export philosophy

- CSV is an analysis-friendly view of effective measurement data.
- JSON is the complete technical backup/transfer format.
- PDF is a user-facing report.
- Mother dossier JSON export preserves persistent mother identity and can be filtered by litter context.
- Care-result reporting reads structured dossier records, not notification state or a parallel result database.

Recurring-reminder, age-based-care and user-owned care-template definitions,
as well as reusable owner/contact profiles, are stored outside the main Puppy
Tracker database. Their backup/restore compatibility is explicit: backup format
v5 carries snapshots of these stores, while older backups rely on normalization
and leave stores that did not exist in the backup untouched. Full restore
coordinates the stores and rolls back already-written stores when a later save
fails. Built-in templates remain code-defined.

Adding a normal preference to the existing main `settings` dictionary does not by itself change the backup envelope: full backups already carry that settings dictionary and normal storage loading backfills missing defaults. Changes to external scheduling stores remain a separate compatibility decision.

## Soft deletion, quarantine and integrity

Measurement history and dossier records favour soft deletion. Historical data remains available for restore/audit/technical backup.

External scheduling stores use quarantine for unreadable/future definitions instead of silently deleting them on load. Quarantine is preservation, not automatic repair: those definitions remain inactive until a compatible reader or explicit migration can understand them.

Automatic integrity repair follows the rule:

> Repair automatically only when the intended result is unambiguous.

Duplicate IDs, ambiguous measurement branches, uncertain ownership and ambiguous external-store definitions must be reported/preserved rather than guessed.

## Diagnostics

Diagnostics must remain privacy-safe while exposing enough health information to diagnose storage/runtime problems.

In addition to main storage counts/integrity information, scheduler diagnostics expose aggregate counts for:

```text
care programs
quarantined care programs
recurring reminders
quarantined recurring reminders
```

Names, notes, result contents and notification targets are not exposed merely to report these health counts.

## Testing strategy

Regression tests should protect data meaning and cross-surface contracts, including:

- timezone ordering and timestamp precision;
- measurement correction chains and birth-weight synchronisation;
- monitoring metrics;
- dossier ownership/CRUD and mother identity resolution;
- owner/contact CRUD, puppy links and full-backup inclusion;
- temperature structured-data rendering;
- upcoming action derivation;
- recurring-reminder normalization, interval/fixed-time/once scheduling and exact owner matching;
- reminder fixed-time timezone behaviour;
- age-based once/range derivation, revision compatibility and protocol locking;
- age-based local-time/DST and same-day before-due behaviour;
- missing puppy source-data warnings;
- dossier-backed care completion/duplicate prevention;
- scheduling-store quarantine, timestamp stability and failed-write rollback;
- care-template validation, day-specific instructions, JSON batch import/export and failed-write rollback;
- notification settings/default migration, deduplication, state isolation and error propagation;
- frontend module load order;
- real browser care-result flow from row to dialog to WebSocket save to immediate row removal;
- export selection, care PDF output and runtime selection;
- diagnostics scheduler health counts.

Manual release testing should additionally cover HACS upgrade, browser refresh/cache behaviour, phone/tablet interaction, mother selection, reminder completion from real dossier logging, age-based care completion, notification-off production testing, explicit test-notification delivery and restart behaviour.

## Future modules and extension rules

The generic dossier envelope, generic recurring-reminder engine and age-based program model should support future workflows such as medication courses, feeding, veterinary follow-up, tests and milestones without creating parallel per-feature task engines.

New care features should prefer one of these established patterns:

```text
structured dossier record
        +
optional generic recurring reminder
        +
derived attention/notification projection
```

or, when the schedule is tied to puppy age:

```text
age-based care program
        +
derived per-puppy occurrence
        +
structured dossier result
        +
derived attention/notification projection
```

over feature-specific persistent reminder/result databases.

Type-specific schemas should be added only when the corresponding feature is implemented and tested.

## Pre-1.0 rule

The pre-1.0 period is the time to correct naming and architecture. Once 1.0 is released, domain names, entity identities, storage contracts, owner-scope semantics, WebSocket message shapes, occurrence identity rules and dashboard element names should be treated as compatibility-sensitive public interfaces.
