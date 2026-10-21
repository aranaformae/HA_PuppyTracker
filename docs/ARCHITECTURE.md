# Puppy Tracker architecture

## PDF branding boundary

Breeder identity lives in `settings.breeder`, with a name up to 200 characters,
contact text up to 2000 and a local logo path up to 2000. A dedicated options
flow edits it with validation and rollback on failed writes. Monitoring updates
preserve those fields. Complete backups include this identity; full replacement
restores it, partial/merge imports keep the current identity, and old full backups
default to empty fields. The image itself remains in HA's `www` directory.
The report export WebSocket accepts only bounded `branding.logo_base64`
(up to 700000 encoded characters). Name/contact come from storage at export
time; clients cannot override them. `report/logo` exposes only the stored logo
path, not contact information. The Report
card obtains PNG/JPEG images only from the HA origin, converts them to bounded
RGB JPEGs and closes decoded image resources after use. The backend never
fetches URLs or reads caller-supplied filesystem paths. It validates JPEG
dimensions (maximum 2048 per side), RGB/8-bit frame information and a 512000-byte
limit before embedding; invalid custom input uses the bundled logo.
Logo, breeder name, breeder contact and puppy profile note have separate
section flags. Contacts and profile notes default off. Profile notes require
Identity, and selecting one puppy cannot expose another puppy's note.

This document describes the architectural direction and current pre-1.0 contracts of Puppy Tracker.

The [Security and privacy review](SECURITY_PRIVACY.md) defines the permission
matrix and export trust boundary. Private owner/contact/payment reads, all
exports and custom WebSocket mutations require an administrator. Custom domain
services use HA's admin-service helper, preserving trusted user-less automations.
Native HA entity controls retain HA entity permissions; the shared dashboard
is not a per-owner portal. Private HTTP downloads recheck the HA principal even
for signed links. Diagnostics expose aggregate integrity information, not raw IDs.

User-facing setup and card instructions live outside this document. See the
[documentation index](README.md), [dashboard card reference](DASHBOARD_CARDS.md)
and [notification guide](NOTIFICATIONS.md). Keeping implementation contracts
here prevents the root README from becoming a second architecture manual.

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

## Frontend presentation contracts

Managed binary assets use `managed_files.py` and
`managed_files_http.py`. The main store contains a bounded
`settings.files` manifest (content-addressed SHA-256 ID, display name, MIME and
size), plus `breeder.logo_file_id`. Binary bytes live in the dedicated
`config/puppy_tracker/files` directory, with restrictive directory/file
permissions. Files never use uploaded filenames as paths. Traversal IDs and
symlinks are rejected; content checksums are verified on reads.

The native Home Assistant FileSelector in breeder options consumes temporary
uploads in an executor. Pillow (a Home Assistant core dependency) decodes only
PNG/JPEG within byte/pixel limits, strips metadata and normalizes to bounded
RGB JPEG. Filesystem reads, writes, decoding and cleanup run in the executor.
Metadata saves happen after the new blob is durable; failed writes restore the
previous references. Replacement/removal cleans unreferenced blobs only after
commit. Temporary failures may leave a private orphan, retried by later cleanup.

The authenticated file view serves only the currently linked branding asset;
other registered/future attachments are not exposed by it. Preview/report URLs
are signed for ten minutes. They are bearer links for that duration and must
not be logged or published. Upload/removal uses the administrator-only native
integration options flow. The existing local-path and bundled-logo fallback
remain available without introducing general upload HTTP/WebSocket endpoints.

Full backup format v6 carries the manifest and a separate `file_data` mapping
of IDs to base64 bytes; v4/v5 remain readable. Missing/extra blobs, unsafe
metadata and checksum mismatches are refused before restore. Deep image decoding
and immutable-file staging precede the authoritative metadata save. Multi-store
restore pins the original files until commit/rollback is complete, including
cleanup invoked by concurrent breeder edits. Rollback restores the original
metadata and drops newly unreferenced staged files. This is coordinated rollback,
not crash-atomic filesystem/database transactions. Partial imports preserve
destination branding; general attachment links and public serving policies for
puppy/record documents are still future work (issue #19).

`rolling_growth.py` derives 48/72-hour percentage series and a 48-hour
time-weighted mean from effective measurement history. Duplicate instants are
collapsed deterministically; cumulative trapezoidal areas and binary-search
window boundaries avoid a quadratic rescan. Full coverage is required and
window endpoints may be interpolated, never extrapolated. These series are
transient `growth_analysis.rolling_growth` response data, not stored entities.
The existing normalized 24-hour monitoring calculation remains unchanged.
`weight_projection.py` fits a continuous elapsed-time-weighted linear trend
over the latest 14 days for the indicative eight-week weight. Four distinct
measured instants and seven days of coverage are required. Piecewise-linear
integrals make the fit independent of denser sampling on the same curve.
The variation band is descriptive, not a confidence/prediction interval.
`growth_analysis.eight_week_weight` is derived response data; it is neither
persisted nor part of notification thresholds. Existing short-window milestone
projections retain their own settings and behavior.

`puppy_tracker/weight/preview` is an authenticated, read-only WebSocket command
using `weight_change_anomaly`, the same rule used after persistence. It returns
only anomaly metadata and the current baseline ID for the selected puppy.
The shared Weighing surface binds confirmation to litter, puppy, entered value
and baseline ID. A busy guard and disabled controls protect the async preflight
and save path; direct record-weight actions are not changed by this UI prompt.

Dossier share `puppy-tracker-dossier-search.js` for accent- and
case-insensitive title/note/result matching and localized search controls.
The query is transient presentation state. Filtering runs over the full loaded
scope, before the Dossier display batch. Input changes replace only the result
list and counts, retaining search DOM nodes. Dossier record actions use
one delegated list listener and authoritative aggregate record keys, so newly
filtered results keep the existing owner-safe edit/delete/move/restore routes.
Background refreshes retain a focused search field. No backend API or storage
migration is added.
Partial updates also synchronize chip state, visibility toggles and search
controls when a pointer action does not blur the search field, as on Safari.

`puppy-tracker-record-editor.js` owns the common saved-item editor and correction
dialog. Dossier, Today's activity list (including Mobile), Temperature
and Behavior history pass an explicit source record ID,
owner scope, puppy ID and litter ID. Display-event IDs are never used as storage
IDs. The editor fetches the canonical record with deleted history included,
checks the returned write permission, and refuses stale/deleted records before
enabling editing. Mother records use the mother API; puppy/litter records use
their exact owner route. Unknown structured fields and internal care links are
preserved. Care result status/result/score and behavior criteria have typed
controls; care/behavior entry types are locked while editing.

The editor is a custom element containing a native modal `dialog`, mounted
outside card rendering. Native modality traps focus and prevents background
interaction; card refreshes cannot remove the form. Its short-lived draft is
never persisted to card state. Failed saves retain the same form, closing a dirty
draft asks for confirmation, and a busy guard prevents duplicate writes. Source
card disconnection closes its dialog; close restores the original focus with
`preventScroll`. Backend admin checks remain the authorization boundary.

The separate scheduled-care execution dialog creates a fact; it does not edit
an existing dossier fact. Weight-event pencils fetch the exact active measurement
and call `measurement/correct`, preserving the original version. They never call
`record/update`. Behavior labels and criteria live in
`puppy-tracker-behavior-schema.js`, shared by the specialized observation entry
surface and the common saved-item editor.

`puppy-tracker-form-state.js` owns shared transient form snapshots, changed-value
checks, localized discard prompts, field-error presentation and saved-item
feedback helpers. DOM-owned forms (Owners, Programs, Reminders and profile notes)
restore their raw field values, including invalid input, after a redraw or failed
save. Model-owned forms keep their existing draft model and use the helper for
change tracking and feedback rather than a second editable store. Dynamic
care-instruction rows are retained with their values. Listener groups are
aborted on rebinding/reset; there is no global event hook, autosave timer,
local-storage draft or extra persistent store.

Workspace retains inline drafts when detaching a tab and blocks tab changes
during a save. Cancelable litter requests inspect every retained child before
replacing surfaces, with one confirmation for all changed drafts. Noncancelable
native/entity announcements preserve busy or dirty children under their original
owner context. Once that draft is finished, reopening its tab resynchronizes
with the Workspace litter. Repeated same-litter announcements do not rebuild
surfaces. Backend owner IDs and authorization remain authoritative.
Saving a form is distinct from refreshing its history, and only successful saves
clear its draft. The care-result dialog also guards close/replacement and locks
all its controls while sending its result.

The frontend cards are projections of the same authoritative entities and
WebSocket data; they must not maintain a second measurement or care-result
store. The Weighing surface calculates the pre-save comparison from the
selected puppy's current and previous weight entities and shows the last
weighing timestamp plus elapsed time. The Growth and Mobile presets compose
that same surface with the detail block enabled, so mobile and desktop expose
the same save-context information.
The session progress sensor exposes `litter_id` and a copied
`weighed_puppy_ids` list. The shared Weighing surface uses these IDs to decorate
native select labels without changing option values, order or availability.
Markers are restricted to active/completed sessions for the selected litter.
Puppy selection retains the local weight draft; saving and explicit litter
selection keep their existing draft-reset behavior. Incremental option updates
retain DOM nodes and refresh only labels/classes when completion changes.
The last-puppy sensor carries the exact saved litter, puppy and measurement IDs
from `mark_weight_recorded`. The compact correction editor fetches that specific
active measurement and submits to the existing admin-only correction API,
omitting timestamp so the original instant is retained. Correcting the tracked
measurement advances its runtime reference to the replacement ID and updates
the last weight without changing weighing progress. Reset/start clears that
reference. Session start/reset is one status-derived command, not a second
frontend session state.

The Litter and Tracker Overview cards share the practical puppy summary fields:
current weight, change from the previous measurement, 24-hour growth, growth
since birth, last weighing and status. Overview-specific growth analysis stays
in its analysis presentation and does not alter the shared summary contract.

The Care Execution surface is an operational projection of open care occurrences.
It supports a selected scheduled date, previous/next date navigation and an
internally scrollable list capped at `60vh`. Date selection changes only the
frontend projection; completion still records the authoritative occurrence by
program, puppy and occurrence ID. The Mobile preset exposes this as a dedicated
Care tab, configured to the current day and without the extra date
navigation so weighing and care execution can happen in one touch surface.

Interactive card rerenders must preserve the surrounding dashboard scroll
position. This includes both the browser viewport and scrollable Home Assistant
view containers. Programmatic focus used when opening editors must use
`preventScroll`, so exposing an input does not unexpectedly move a phone or
tablet dashboard.

Card-owned behavior is implemented by the card itself or by a helper imported
directly by that card. In particular, Attention loads recurring reminders as
part of its normal data cycle before filtering and item limits are applied, the
Recurring Reminders card resolves its mother owner through the mother API, and
the Litter card invokes its profile/detail presentation helper explicitly.
Small reusable helpers such as collar colors are imported by their consumer,
while one-card layout behavior remains on that card. Cross-card modules remain
only where one feature deliberately coordinates several independently defined
card surfaces. Today, Attention and Care Execution import named care load/render
functions and invoke them explicitly in their own lifecycle. Attention does the
same for acknowledgement and mother-action presentation. There is no global
card-hook registry: composition order is visible in each base card, while
neither `frontend.py` nor the Workspace has to encode helper initialization.

`frontend.py` is the authoritative registration order for card elements only.
Imported helpers are ordinary ES-module dependencies of their owning cards.
Every card owns its localization lifecycle; the large
Overview dictionary is a stateless helper imported directly by that card.
Summary and Litter render their localized UI directly. Dossier
render their list actions directly, while the shared saved-item editor owns
the editing dialog and source-owner save routing. Shared care layers
export ordinary functions; their callers determine a fixed, reviewable order.
A new one-card behavior should live in that card or be imported directly by it,
never depend on replacing a prototype later in the sequence.

## Integration identity

```text
Display name: Puppy Tracker
Domain:       puppy_tracker
Package:      custom_components/puppy_tracker
Storage key:  puppy_tracker
WebSocket:    puppy_tracker/*
```

The old prerelease `puppy_weight_tracker` identity is intentionally not retained as a compatibility layer.

### Home Assistant platform boundary

The integration exposes sensor, binary-sensor, select, number, switch and
button platforms. Per-puppy and per-litter entities are projections of the
same storage and metric functions used by the cards; they are not an
independent state model. The weighing-station controls use runtime selection
and session state, while a saved weight always enters authoritative
measurement storage.

Four Home Assistant actions form the supported automation boundary:

```text
puppy_tracker.create_litter
puppy_tracker.add_puppy
puppy_tracker.record_weight
puppy_tracker.backup_to_file
```

Their runtime schemas in `__init__.py` are authoritative. `services.yaml`
mirrors those fields for the Developer Tools action UI and must be updated in
the same change whenever an action schema changes. Litter and puppy arguments
are stable Puppy Tracker UUIDs, not names or entity IDs.

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
    ├── contact, placement and payment fields
    ├── puppy_preferences[] -> {puppy_id, note}
    └── status_history[]
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

The litter options form uses `suggested_value` for clearable growth fields.
Absent overrides have no schema default: `NumberSelector` cannot validate
`None` as a float. Clearing a suggested override restores its fallback on
submission. Milestone percentages, doubling reference age and projection
sample count are exposed in the same form and normalized by storage.

Puppy and parent optional identity fields follow the same clearable suggestion
contract, including dates and birth weight. Notification recipients are also
suggestions, so an omitted picker value clears the list. Monitoring and
notification forms preserve the other form's settings through the shared storage
API. `NotificationSettingsMixin` owns the sole monitoring settings route.
Unchanged puppy birth-time input retains the original timestamp because the
datetime selector only displays whole seconds.

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

Dossier displays weight events beside dossier records, but authoritative weight data remains in `measurements[]`.

The Overview card keeps analysis data available independently of presentation.
Per-card options `show_advanced_analysis`, `show_growth_milestones` and
`show_milestone_chart_annotations` control detail panels, milestone progress
rows and chart annotations respectively. Advanced analysis defaults to hidden;
milestones and their chart annotations default to visible. These are
presentation-only options that do not affect metrics, storage or other card
instances.

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
behavior_observation
other
```

Temperature is a structured dossier event. Its Celsius value belongs in record data rather than being encoded only into title/note text.

Feeding is also a structured dossier event. Its optional `feeding_type`, `amount`, `unit` and `observation` values belong in record data and are available from both Dossier and Quick Log. Legacy free-text feeding notes remain valid and are not migrated automatically.

`behavior_observation` is a puppy-only structured dossier event. Its `data.scores`
mapping uses stable criterion IDs and whole values from 1 through 5; optional
observer, context and derived age-in-days remain part of the same event. The
storage boundary validates the mapping and rejects litter/mother ownership. The
longitudinal profile is derived by `behavior.py`: observations are ordered by
their actual timestamps, each criterion is averaged independently, group scores
average the available criteria and the final profile score averages those
criterion means. No mutable second profile database is stored. Integrity and
restore validation enforce the same puppy-only ownership and score contract.

### Changing dossier ownership

The Dossier card can move a record between the literal `litter`, `mother` and `puppy` scopes within the selected litter. This operation removes the record from its current owner list, updates its scope and owner references, and appends it to the destination owner list in one save operation. It preserves the record identity and audit history, so the action is a move rather than a duplicate. Mother moves require the litter's linked persistent mother; puppy moves require an explicit puppy ID. The storage layer rejects mismatched scope/ID combinations at its boundary. Behavior observations can only move from one puppy to another.

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
The mother records API derives its action summary from the selected current/all
litter record collection through `dossier_action_summary`, rather than returning
an empty placeholder. Deleted sources and active completion records follow the
same `upcoming.py` rules as puppy and litter dossiers, independently of whether
deleted records are included for history inspection.

Vaccination/deworming follow-ups use the common editor's `followup` mode, not
`edit`. It fetches and checks the source, locks the category, initializes a new
execution timestamp, and proposes only reusable product/vaccine details. Old
doses, weights, batches, notes and results are excluded; the next due date is
initially empty. The existing admin-only `record/add` and `mother/record/add`
commands accept optional `followup_record_id` and `followup_due_date` arguments.
Storage validates source ownership, active state, category, exact due date,
required product/vaccine and absence of another active completion under its
mutation lock. Completion saves are serialized and roll back runtime data on a
failed disk write, allowing a safe retry.

The new dossier record stores that provenance in `data`; no task store or schema
migration is needed. `upcoming_actions` builds a linear-time set of active
completion keys (owner, category, source ID and due date), then omits matching
actions. Unrelated care, other owners and changed source due dates do not resolve
an action. Deleting/restoring or moving a completion recomputes the projection.
The source record is never rewritten. Existing dashboard dispatch signals update
counts and notification reconciliation. Backup JSON preserves the provenance;
frontend detail views and PDF output hide its internal keys.

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
last_completed_due_at
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
4. optional `match_title` matches exactly after normalized case handling, or an explicit execution links this reminder ID;
5. litter context matches;
6. owner scope matches;
7. owner ID matches;
8. the record has a valid, non-future execution timestamp.

This exact-owner rule is a critical invariant. A puppy temperature cannot complete a mother temperature reminder and neither can complete a whole-litter reminder.

Reconciliation derives the latest completion from active owner history instead
of only moving a stored cursor forward. Editing, deleting, restoring or moving
an execution therefore recomputes the projection. Older manual completion state
without a linked record ID is retained. Explicit `recurring_reminder_id` links
only match that reminder. Historical unlinked records and unflagged records from
other entry points retain category/title matching. New Quick Log records without
an explicit selection carry `data.recurring_completion = "none"`; matching always
rejects this marker, even after edits or backup/restore. Dossier and PDF details
hide it. Explicit execution removes an incoming opt-out marker before linking
the new fact to the selected reminder.

The admin-only `recurring_reminder/record` command uses the shared record editor
in `reminder` mode. The server resolves owner/category from the definition, checks
the expected definition timestamp and due instant, validates execution time and
required category values, and serializes execution against definition changes.
The optional `expected_context` also checks the intended litter, owner scope,
puppy ID and category before either saving or returning an idempotent retry.
The list response's `owner_available` flag excludes definitions whose owner is
no longer linked to the litter from Quick Log choices.
It writes one authoritative dossier fact with `recurring_reminder_id` and
`recurring_due_at`. There is no two-store transaction: reminder completion is a
rebuildable projection, so projection-write failure never requires another care
fact. Repeated requests for the same active execution return its existing ID and
an `already_completed` flag. Failed main-store writes roll back runtime state.
Dashboard signals trigger reconciliation and notification withdrawal as before.
Backups preserve links and the fixed-slot cursor; PDF/detail views hide internal
keys. `puppy-tracker-recurring-surfaces.js` shares Today/Mobile rendering, direct
actions and exact saved-record feedback; Attention and the Reminders management
surface use the same editor and action helper. Seen acknowledgements remain
independent of execution.

The list response includes `last_execution`, resolved by the reconciled record
ID within the exact owner history, cached once per owner per request. It never
substitutes another recent item from the same category. Legacy manual timestamps
without a record ID remain timestamps only. The shared recurring-surfaces module
renders expandable details and schema-labelled values; expansion state is local
to the card and survives its background renders without changing the URL.

The admin-only `recurring_reminder/undo` command accepts the reminder ID, exact
record ID and expected record revision. It serializes against definition changes
and resolves ownership server-side. A synchronous deletion validator runs under
the main storage lock, checking the active execution link, litter/scope, revision
and latest matching execution before soft-deletion. This closes the race with
ordinary dossier edits/moves and newer direct or unlinked executions.
Older manual-only completion
dates are retained separately as `manual_completed_at` during normalization, so
undo/deletion after reconciliation cannot erase this historical baseline.
Failed main-store writes roll back runtime data, including audit entries. Completion
remains a rebuildable projection, with ordinary update signals recalculating
planning and notifications. The UI offers undo only for a new successful save,
not an idempotent retry; its transient confirmation is not backed up or restored.

### One-time postponement

The admin-only `recurring_reminder/postpone` command takes the expected revision
and effective due instant, plus `until` (a future ISO timestamp, or `null` to
cancel). Under the same reminder-store lock as execution and definition edits,
it validates current owner/history and rejects stale projections or moments.
The save rolls back in-memory state on persistence failure; it creates no dossier
record and does not change recurrence fields or completion time.

An additive, normalized `postponement` object persists the original
`scheduled_at`, effective `until`, and completion baseline (`completed_at` and
`completed_record_id`). `scheduled_due_at` calculates the unchanged schedule;
`next_due_at` applies the override only when both the original slot and baseline
still match. The list response exposes `scheduled_due_at`, `postponed` and
`postpone_before`. Fixed-time postponement must end strictly before the next
clock slot, including across midnight. If the next slot already passed, the
overdue moment must be resolved instead of postponed across later turns.

While an active override is in the future, derived status is `postponed`, not
`due_soon`, regardless of notification lead time. The existing notification
coordinator therefore withdraws both tracked delivery types and remains quiet
until the new deadline. At/after that instant normal due/overdue delivery resumes.
Today/Mobile and management retain the item with postponed labeling; Attention
only includes eligible due/overdue items.

An explicit execution retains its effective due instant in `recurring_due_at`
for idempotent retries and records the original slot in `recurring_scheduled_at`.
Reconciliation uses that original slot for `last_completed_due_at`. All internal
keys remain hidden in generic dossier/PDF fields; Last execution labels both
planned times. The dormant override does not affect subsequent occurrences but
can apply again after execution undo/deletion restores its baseline. Definition
changes to owner, matching, enabled state or schedule clear it. Title-only edits
do not. Backup/restore and restart preserve the override without a storage-version
increase or separate task/timer database.

The shared record editor owns a focused `postpone` mode, outside card rendering,
with the same singleton, focus, draft, busy and navigation protections as record
editing. It does not route through dossier save validation. Shared recurring
action helpers render clock/complete controls across the four surfaces.

### Interval schedules

For `interval`, the next due time is:

```text
(last_completed_at OR start_at) + interval_minutes
```

This deliberately makes the schedule follow the actual completion time. A late action shifts the next interval instead of accumulating artificial lateness from an old planned time.

### Fixed-time schedules

`fixed_times` contains normalized `HH:MM` local-clock values. Fixed schedules preserve the timezone represented by the caller/Home Assistant local time. They must not be silently converted through an unrelated process-default timezone before constructing the wall-clock candidate.

The first unconsumed slot after `start_at`, the latest execution and any explicitly
consumed `last_completed_due_at` remains due, even after its time passes. Early
execution consumes the selected slot rather than presenting it again. An actual
late execution advances past missed earlier slots without creating fictitious
logbook executions for them.

### One-time schedules

`once` uses `due_at`. Once a matching dossier record sets `last_completed_at`, there is no next due occurrence.

### Derived reminder status

Reminder status is calculated, not persisted as authoritative state:

```text
completed
disabled
upcoming
postponed
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
contact details (street, postal code and city are stored separately) plus role,
preferred contact method, placement status, actual
placement date, expected pickup date, payment status, total amount, registration
fee, deposit amount/date, actual outstanding amount, final-payment date/method,
an ordered `puppy_preferences` shortlist, status history and notes. The shortlist
contains at most three unique `{puppy_id, note}` entries; list order is the rank
and each optional note is limited to 240 characters. It is explicitly separate
from a puppy's authoritative `owner_ids` placement links. The scheduled
final-payment amount is derived as
`total - registration fee - deposit` by the shared backend helper and is never
persisted as a second source of truth. Monetary values are normalized as
non-negative decimal strings; registration fee plus deposit cannot exceed a
known total.

The Owners detail view groups the same fields into native `details` disclosures
for contact, address, placement, puppy preferences, finance, notes and history.
Disclosure choices are card-local per owner, not stored in `OwnerStore` or backups.
Native toggles do not rerender or call the API. Before another action rebuilds
the view, current open states are captured; entries for deleted owners are pruned.
Full-width notes retain their complete text. The create/edit form, CSV and PDF
data contracts are unchanged by this presentation grouping.

`puppy_tracker/owners/save` accepts the complete ordered list. Sending `[]`
clears it, while omission preserves an existing list so an older cached card
cannot accidentally erase newer data. Structural validation is authoritative,
but a preference is allowed to outlive current puppy availability. This keeps a
restore or later puppy removal lossless; the card renders such a reference as
unavailable and never exposes its internal ID. Final placement still requires
the separate `puppy_tracker/owners/link` command.

The Owners card derives its preference matrix entirely from `OwnerStore`
shortlists, litter puppy metadata and each puppy's authoritative `owner_ids`.
No matrix, conflict or aggregate count is persisted. A conflict means more than
one currently visible owner has the same puppy as first choice; sold and placed
owners are excluded unless explicitly shown. Wide cards render a scrollable
owner-by-puppy table with sticky headers. At 1000px card width, a fixed side
column holds selected details without resizing the table. A container query
replaces the table at 620px or less with compact lists by puppy or by owner,
derived from the same filtered model. Perspective and selected owner are local
presentation state, not configuration or stored data. Cell selection updates
only selection attributes and the desktop/inline mobile detail regions,
avoiding a full card render and retaining existing list and table DOM nodes.

Full v5 backups include the owner store; partial transfers omit it because
references cannot be remapped safely without an explicit owner-transfer flow.
The owner's microchip value is a separate puppy `chip_number` text field and is
not part of owner/contact storage.

Owner normalization accepts the former free-form `address` field only as a
legacy input. When split fields are still empty, that value is retained
verbatim in `street`; parsing postal codes or cities from arbitrary historical
text is deliberately avoided.

### Contract identity

Puppies store `registered_name`, call-name `name`, `birth_time`, `sex`,
`coat_color`, `collar_color`, `chip_number` and `breed` as distinct fields.
Persistent mother profiles and litter-owned `father_details` store
`registered_name`, call name, `birth_date`, `breed`, `wala_number` and
`chip_number`. Parent chip numbers use the same optional text normalization as
puppy chip numbers, preserving leading zeroes. Normal load migration backfills
missing fields without changing the schema or backup envelope. The
display `litter.mother` and `litter.father` values remain the canonical call
names, while mother identity remains reusable across litters. Missing breed
values normalize to `Multi-generation Australian Labradoodle`; user-entered
values remain editable and authoritative.

The Owners-card presentation CSV joins each reusable owner to its linked puppy
and litter at export time. Puppy and parent contract identity comes from the
authoritative main profiles, not `OwnerStore`. This keeps exported identity data
current without duplicating it. The download awaits a forced reload of owners,
litters and litter payloads; a failed reload aborts the download instead of
serializing cached identities. Preference labels are resolved from those same
profiles at export time and emitted with their notes; internal puppy IDs are
never exposed. The configured comma or semicolon delimiter changes serialization
only, never stored data.

## Notification architecture

Notification delivery is a projection over authoritative monitoring/reminder/care state. Delivery state must never become scheduling truth.

Dossier notification preferences are exposed by the central notification
options flow and the original number/switch entities, backed by the same
`CareReminderStore`. Its atomic `async_update_preferences` operation supports
both a complete form save and partial entity updates, preserves delivery state
and rolls runtime data back on a failed save. Entity listeners use
`SIGNAL_DASHBOARD_UPDATE` and unregister on removal, keeping form and entity
controls synchronized. These category/day-window preferences are distinct from
care-program and recurring-reminder minute-window settings.

The shared recurring notification coordinator:

- reconciles generic reminder completion before evaluating status;
- checks periodically (currently every 10 minutes);
- reacts to Puppy Tracker dashboard update signals;
- creates Home Assistant persistent notifications for actionable states;
- optionally sends content to configured `notify.*` entities;
- dismisses stale persistent notifications and clears compatible tagged mobile
  notifications when an item is no longer actionable;
- coalesces dashboard signals received during an active check into one immediate
  follow-up run, so state transitions do not wait for the periodic interval.

Generic recurring reminders and age-based care share the same coordinator lifecycle and shared `notification_delivery.py` helper rather than creating a second polling engine.

### Generic reminder notification settings

Automatic generic recurring-reminder delivery is controlled by the independent `recurring_reminder_notifications_enabled` setting rather than the general `notifications_enabled` switch. The key is part of the official main-storage settings contract and older stores receive the default during normal load migration without changing reminder data or the storage schema version.

Notification controls are presented centrally through the options flow. Monitoring thresholds remain under monitoring settings; notification preferences contain the general Puppy Tracker notification toggle, the default notification lead time, recurring-reminder delivery toggle, recovery/session-complete preferences and shared `notify.*` targets.

The default `notification_lead_minutes` setting is part of the main-storage settings contract and is backfilled for older stores without a schema-version bump. Scheduler definitions can optionally carry their own `notification_lead_minutes`; `None` means the integration default applies.

### Age-based care notifications

Age-based care delivery requires both the general Puppy Tracker notification setting and the program's own `notifications_enabled` setting.

Open `due_soon`, `due_today` and `overdue` age-based occurrences are actionable for care delivery. Clocked upcoming occurrences enter `due_soon` when their scheduled local time falls inside the program-specific lead time, or the integration default when the program value is empty. Related puppy occurrences are grouped by program/age context instead of producing one push per puppy.

The notification message includes the occurrence's resolved `instructions` value.
This means an `instructions_by_age` entry is shown in both the Home Assistant
persistent notification and the configured mobile `notify.*` delivery for that
day. When grouped puppy occurrences carry the same instruction, it is rendered
only once.

Mobile care-delivery deduplication is currently runtime-only. An unresolved occurrence may be delivered again after integration/Home Assistant restart; reboot-persistent delivery deduplication is not currently an architectural guarantee.

Within one care-notification pass, dossier records are loaded once per puppy and
reused across all enabled programs for that puppy. This keeps storage reads tied
to the number of puppies instead of the number of program/puppy combinations.

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

`runtime.py` is the canonical lookup boundary for this state. WebSocket and
download modules use `get_runtime_data`, `get_runtime_storage` or
`require_runtime_data` instead of importing private helpers from another API
module. Composite entity/dashboard refreshes are likewise centralized in
`updates.py`, so dossier and measurement mutations cannot silently omit one of
their required dispatcher signals.

The Home Assistant config-flow handler is defined once in `config_flow.py`.
That module composes the feature mixins with
`PuppyTrackerManagementOptionsFlow`; it does not replace classes or globals in
the management module at import time. This keeps fresh installation and options
setup on the same explicit class graph.

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

Frontend resources are served under a path containing the integration
`VERSION`. Relative ES-module imports inherit that path, so a release cannot
combine a newly loaded card with a cached shared module from an older release.
The manifest and `const.py` version therefore form one release/cache contract.

The backend remains source of truth for monitoring state, effective measurements, dossier data, mother identity, recurring reminder definitions/status, care program definitions, care occurrence status and completion.

Frontend composition layers may enrich presentation, but must not invent a second persistence model.

Behavior owned by one card should live in that card instead of a late prototype
patch. Shared stateless presentation rules may remain importable utilities. The
collar-color mapper follows that model: weighing and overview import the same
function, while chart series receive their color during normal rendering.
The Overview card also owns its registry-refresh subscription directly, so an
imported or newly created puppy is discovered before history is reloaded.
Its horizontally scrollable chart navigation is an imported helper invoked by
the card during its normal metric, render and event lifecycles; it is not a
separately registered module and does not replace Overview prototype methods.
Cross-surface utilities remain appropriate where one feature deliberately
spans several internal surfaces. Such utilities should export named operations
that the owning cards call explicitly during load or render, rather than
registering global hooks or replacing methods on a card prototype.

The Report card owns its complete selection and export model directly: whole
litter, individual puppy and mother are explicit states in the card. Inactive
puppies remain available because deactivation ends operational tracking but
does not erase reportable history. Mother-history scope and its JSON-only export
path are not late selector or method patches. This keeps export behavior
independent of frontend module load order and gives WebKit an explicit download
filename for signed mother exports. Runtime labels, export progress and
Lovelace editor choices are also localized by the card itself.

The Weighing card owns its interaction-safe rendering and localization. It
normalizes the Dutch session/status sensor contract into the active Home
Assistant language while leaving litter and puppy names untouched.

Overview performs one synchronous, card-owned localization pass immediately
after replacing its shadow DOM. Its imported helper has no observer, global DOM
scan or constructor patch, so localization cannot trigger an extra render or
depend on frontend registration order.

The unified Dossier owns the sole general history surface. The old Timeline
card and its duplicate scope/filter/render implementation are removed.
`puppy-tracker-dossier-history.js` merges canonical records and measurements for
presentation, preserving exact owner keys and measurement IDs. It never writes
data or converts measurements to ordinary care records. Categories derive from
actual record types, including behavior observations.

Dossier captures litter/scope at load start and publishes its complete snapshot
only when the load generation is still current. Missing owners disable creation
instead of falling back to the litter. Whole-litter scope means litter-owned
records only; All includes litter, current-litter mother and all puppy histories.
Measurement versions are fetched only for relevant puppies when an administrator
enables history and has measurement permission. The normal view uses active
measurements already provided by the litter API.
The existing litter records endpoint also returns puppy follow-ups. The history
helper admits follow-ups only when their source ID exists in the exact owner's
returned record set. Aggregation then combines each owner once, preserving the
source owner and showing an explicit owner label in To do.

Native disclosures show full details without requesting data or rebuilding the
card. Expansion and scroll state survive updates, and unchanged markup retains
the existing DOM. Profile notes and advanced filters have separate disclosures.
Date/category/search filters run before the bounded display batch; Show more
extends that batch. `show_history`, `show_weights`, `show_details`, `max_items`
and `max_height` form one presentation contract, inherited through Workspace.
The shared editor requires an explicit owner for new entries opened from All.
The choice uses stable scope/puppy keys, survives failed validation and cannot be
saved after the source litter changes. The backend/storage/export contracts are
unchanged.

The Dossier card owns its four scopes directly. Its aggregate records keep
private source-owner metadata for edit, move, delete and restore operations,
while mother records use the dedicated mother endpoints. Mother profile notes
and current/all-litter history are part of the normal Dossier state and render
flow. No separate mother-dossier or aggregate-scope patch module is loaded.

Quick Log owns its complete single-owner workflow directly. Litter, mother and
puppy selection, remembered owners per preset, structured type fields and the
corresponding owner-specific save endpoint are handled in the base card. The
owner selection is resolved once per configuration context: a configured mother
or puppy, a manual choice, or the first preset's remembered owner takes
precedence over later preset history. Data refreshes do not reapply `puppy_id`,
and presentation-only configuration updates retain both owner and draft.
Its presets and Bulk Dossier's type selector both derive from the same
`RECORD_TYPES` and `TYPE_FIELDS` schema used by Dossier; no surface-specific
category subset is maintained. Quick Log's Stool / urine shortcut remains a
titled `note` record rather than a separate stored type. There is no
temperature compatibility module and `mother-surfaces.js` exports the mother
load/render operations invoked explicitly by Attention.

Quick Log loads recurring choices with its litter data, filtered by exact owner
and type, without automatic selection. A draft stores a snapshot of the chosen
definition revision and due instant. Explicit refresh never upgrades that
snapshot to another occurrence; an outdated choice remains visible separately
until the user replaces it. Background updates stay deferred while typing.
Owner/category changes retain input but clear the link; changing litter retains
the existing discard confirmation. Missing owners in an active draft are not
replaced by litter scope. The shared record-editor helpers build the execution
request and saved-entry/undo feedback for both Quick Log and direct execution;
there is no second scheduling or completion engine. Log-only writes use the
normal owner-specific add endpoints and retain the opt-out marker in generic
record data. Failed writes roll back runtime data just like linked executions.

## Frontend surfaces

The supported public element namespace is deliberately small:

```text
custom:puppy-tracker-workspace-card
custom:puppy-tracker-owner-card
custom:puppy-tracker-report-card
```

The Workspace owns five presets (`home`, `growth`, `journal`, `care` and
`mobile`) and composes the established feature elements as internal surfaces.
Those elements are loaded for composition but are not advertised in
`window.customCards` and are not a supported dashboard-YAML API from 0.25.0.
This intentional breaking change removes the public compatibility obligation
that previously made load order and prototype patches part of the card API.

Workspace surfaces are created once per configuration, but only Summary and the
active tab are attached to the DOM. Switching tabs detaches the old surface and
attaches the retained element for the new one. Standard custom-element
`connectedCallback` and `disconnectedCallback` lifecycles therefore start and
stop subscriptions without discarding local form state. A preset only creates
surfaces it can expose; Home may additionally mount Summary and Journal may
mount the Bulk action. `tab_config` is the explicit escape hatch for advanced
surface options without growing the top-level workspace schema for every
specialist setting.

The Workspace visual editor is preset-aware. Its base fields describe shared
identity and navigation, while each preset contributes grouped fields for only
the surfaces it can display. Editor values are normalized back into the same
top-level and `tab_config` structure consumed by YAML; changing presets must
remove invalid tabs and defaults instead of preserving inaccessible surface
configuration as active navigation.

The Workspace owns the shared litter context. Internal surfaces request a
litter change through one composed event; the Workspace updates the other
surface configurations instead of allowing each tab to drift independently.
The top-level `show_litter_selector` value is propagated to every tab surface,
including Puppies, Weighing, Analysis and Temperature. Each surface owns its
conditional rendering so hiding the nest control cannot accidentally hide
unrelated owner, puppy, metric, period or day controls. Summary follows the
shared context and intentionally has no duplicate nest selector.
The weighing surface announces the actual litter device identifier after a
successful Home Assistant select action. It is retained as the event source so
an in-progress weight entry is not rebuilt. Filter state for Quick Log and Dossier
is namespaced by Workspace and surface; `state_key` can distinguish
otherwise identical Workspace instances.

Mother scope is expected on Dossier, Quick Log, Attention, Report/export and Recurring Reminders where the workflow logically supports a single owner. Bulk Dossier remains puppy-oriented because its purpose is one event applied to multiple puppies.

The Temperature surface is a focused temperature workflow. It reads structured
`temperature` dossier records, supports litter, mother and puppy scope, offers
a configurable history range, renders a compact SVG trend view and writes new
readings through the same dossier APIs as the other cards. It is an additional
presentation surface, not a separate temperature store. Selectors, latest
reading, chart, visual threshold lines, history and editor are independently
configurable. Chart height, history order, history height and row limit are
also presentation options so one card can be compact while another remains a
complete temperature workstation.

The Behavior surface is a focused puppy-only observation workflow. Journal and
Mobile expose it as a retained Workspace tab. It writes structured
`behavior_observation` records through the dossier API, supports partial scoring
and derives the current profile from active records. The frontend and PDF use
the same criterion grouping and neutral 1-5 visibility semantics; scores do not
encode good/bad behavior. `show_profile`, `show_history` and `max_items` are
presentation options. Mobile hides the longer history by default.

The Calculator surface is available in Care and Mobile. Its per-kg variant is
a read-only projection.
For each selected-litter puppy it reads the canonical
`summary.current_weight`, multiplies kilograms by the user-entered amount per
kilogram and derives a litter total. It does not persist a dose, feeding amount
or dossier event. Missing weights are excluded, stale weights are marked, and
the card defers subscription-driven refreshes while an input, slider or selector
has focus so live updates cannot interrupt entry. Result updates change text
nodes only and retain slider controls and list scroll position. Explicit mode
switches blur the previous control and focus the selected mode without scrolling.

The same Calculator surface offers `default_mode: feeding`. A pure module,
`puppy-tracker-feeding-calculator.js`, calculates brand-neutral food profiles.
It is dependency-free and can also run outside Home Assistant; the input model,
equations and acceptance examples for an owner-facing website are documented in
[FEEDING_CALCULATOR_STANDALONE.md](FEEDING_CALCULATOR_STANDALONE.md).
Each food independently supports `linear` (coefficient x kg + offset),
`table` (piecewise interpolation), `per_kg` (kg x fixed daily rate), or
`age_table` (the applicable age stage's weight table).
Each food's full daily ration is multiplied by its selected share before sums
and portions of each food are calculated using their independent counts.
Neither food is added at full quantity when
the other food is also selected. This is proportional ration planning, not
energy or nutrient matching in the default `allocation_mode: ration`.
`allocation_mode: energy` instead derives daily kcal from weight x `kcal_per_kg`
and converts each food's kcal share to grams using its `kcal_per_100g` density.
No target or density is assumed: both default to zero, and energy mode requires
a positive target and densities for included foods. Ration methods and their
weight/age boundaries are not used in energy mode. It does not balance nutrients.
Formulas respect their configured weight range;
tables respect the first/last row without extrapolation. Zero-share foods do
not impose a range restriction. Validation returns explicit missing-weight,
invalid-settings, missing-age, before-first-stage or out-of-range states, which
are excluded from litter totals.
Feeding preferences are persisted per litter as `feeding_settings` with
`allocation_mode`, `kcal_per_kg`, `meat_percent`, `kibble_portions_per_day`, `meat_portions_per_day` and nested
`kibble`/`meat` profiles. Counts are whole numbers up to 12, positive for an
included food; zero is allowed for an excluded food. Feeding moments are derived
from included-food counts, never multiplied by the number of puppies.
Each profile contains `method`, `grams_per_kg`, `coefficient`, `offset`,
`min_kg`, `max_kg`, `kcal_per_100g`, a `table` of [kg, daily grams] rows and
`age_tables` of `{from_day, table}` stages. At most 24 stages use strictly
increasing whole start days (0–3650), each with a normal validated weight table.
Age uses completed 24-hour periods from puppy `birth_time`, falling back to
litter `birth_date`; missing/future dates do not silently become zero. Stage
selection is inclusive of its start day; the last applicable stage persists,
without interpolation between ages or extrapolation beyond table weights.
Unselected
method values are retained when switching. `feeding.py` validates finite
non-negative formula values, positive rates, ordered weight ranges, whole
portions and 2–100 strictly increasing positive table weights/positive rations.
Old nested profiles gain zero density and empty stages without altering their
existing calculations. Invalid drafts are neither saved nor automatically replaced.
The original flat `kivo_grams_per_kg`/`kibble_formula` preferences normalize
to these profiles. An old shared `portions_per_day` count splits by ration
share, rounding half upward and retaining at least one moment per included
food. If both foods were given in one mixed portion, two separate moments are
needed. Daily rations are unchanged; per-food portions follow the new counts.
The frontend uses the same conversion, and no combined per-portion total is
returned or displayed. Zero-share foods impose neither weight-range nor meal
count contributions. Converted profiles are validated in backups as well;
the admin-only `puppy_tracker/feeding_settings/update` websocket endpoint saves
atomically, audits changes and dispatches a dashboard update. Calculated amounts
and feeding events are not persisted by the calculator. Older litters use the
50% meat/one kibble portion/two meat portions, the original kibble table and a
45 g/kg meat rate.
Full and litter backups carry
and validate the preferences; puppy-only imports preserve the destination plan.

Input events calculate immediately; completed changes queue serial saves per
litter, retaining the newest draft. Failed writes retain the draft with retry
feedback. Revision guards prevent stale reads from overwriting edits or saved
values, and replies for another litter cannot replace current controls. Save
feedback changes text without rebuilding the form. The selected variant uses
browser-local card state; per-kg amount and unit remain session-only.

The recurring-reminder card must resolve the linked mother through the mother scope rather than requiring `litter.mother_id` in the ordinary litter payload.

Presentation density is configured per Lovelace card instance. The Overview
card exposes independent switches for advanced analysis, growth milestones and
chart annotations. Advanced analysis defaults to hidden while milestone rows
and annotations remain visible. The Litter card uses `show_details` to control
secondary growth columns and expandable per-puppy metadata and defaults to its
detailed presentation.

Milestone projection is derived presentation data. The per-litter `milestone_projection_measurements` setting selects 2 to 8 recent valid growth periods, with 4 as the default. The backend returns the mean daily growth, an uncertainty range, a confidence level and an irregular-cadence flag; the original single-date estimate remains available for clients that only understand `estimated_at`.

### Configurable initial workspace scope

Dossier, Temperature and Quick Log receive a presentation-only
`default_selected` workspace option with
the values `all`, `litter`, `mother` and `puppy`. The option controls the scope
used during the initial load; the interactive scope selector remains available
and changing it does not change persisted data. A configured `puppy_id` selects
that puppy when `default_selected` is `puppy`; it is ignored for the other
initial scopes. The aggregate
`all` view combines litter, mother and puppy records where supported. Existing
items in that combined Dossier view keep an internal source scope and source
puppy id, so edit, delete, restore and owner-change actions are sent to the
correct owner API. The add action is intentionally available only after a
specific litter, mother or puppy scope is selected; this prevents a new item
from being stored under an implicit owner. Quick Log deliberately keeps an
explicit single owner selection because applying an aggregate default to a new
log entry could store the action under the wrong owner.

Today and Attention consume backend-derived age-based occurrence status. Recording a care result must refresh occurrences and render the refreshed state immediately; a completed row must not remain stale until another dashboard event.

Today, Attention and Care Execution open the same care-result editor. The
shared flow resolves the occurrence once and owns status, result, score, note
and day-specific instruction handling, so a direct completion button cannot
bypass fields that another surface would save. Care Execution subscribes while
visible and coalesces updates that arrive during a load; a refresh is deferred
while the result editor is open so typed text is not replaced.

The Dossier card presents care-result records with their user-facing metadata:
care day, scheduled time, status, result, score, resolved day-specific
instruction and additional care data. Editing an existing care-result record
allows status, result and score changes through the normal record-update path;
the occurrence and program identifiers remain preserved but are not rendered as
user-facing fields.

### Shared category filtering and list presentation

Dossier, Today and Attention surfaces use type/category chips as a presentation
filter over the already-derived backend data. The filter is inclusive: selecting
`All` selects every type currently available on that surface, and clearing every
type is a valid state that renders no matching items. The filter must not delete,
acknowledge, complete or otherwise mutate records or occurrences. Temperature and
age-based care types must be offered when present, so they cannot disappear merely
because they are not part of an older static type list.

Attention keeps its item list internally scrollable with a maximum height of
`60vh`. Today caps its combined activity area at 520px. Dossier's `max_height`
defaults to 520px. Its history starts visible; `show_history` can start it
collapsed without removing the toggle. Advanced category/date/deleted-version
filters are inside the history under Filters. These presentation choices never
change saved data or completion state.

## Export philosophy

- CSV is an analysis-friendly view of effective measurement data.
- JSON is the complete technical backup/transfer format.
- PDF is a user-facing report.
- Mother dossier JSON export preserves persistent mother identity and can be filtered by litter context.
- Care-result reporting reads structured dossier records, not notification state or a parallel result database.
- PDF periods filter measurements, chart samples, care results, behavior
  observations and ordinary litter/puppy dossier records. Care and behavior
  records are excluded from the generic dossier section and have independent
  report sections; internal reference IDs are not printed. Dossier source
  and category filters apply only to that section; an empty list selects none.
  PDF static labels use the selected Dutch/English language while user data is
  preserved verbatim. Long table cells continue across pages with repeated
  headers, and single chart measurements render as points.
- The first in-period weight difference uses the most recent earlier effective
  measurement, while that earlier row remains outside the report period.
- PDF section switches are independent except that contact details require
  owners and weight-alert status requires attention. Summary, weight-attention
  and owner sections remain current-state context. Owner contact data is
  emitted only when both the owner and explicit contact sections are enabled.
  The owner section reports expected pickup and the normalized payment fields;
  its final-payment value is calculated from the same helper used by storage
  tests and is not read from a stale persisted total.
  Identity output uses separate registered/call names, coat and collar colours,
  chip number and breed/type for each puppy, plus both parent identity profiles.
  Owner contact output uses split street, postal-code and city fields.

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
- shared saved-item editing across aggregate/search views, Today/Mobile,
  Attention, Temperature and Behavior; source-owner routing, care metadata,
  partial behavior scores, measurement corrections and draft/focus retention;
- puppy name/collar labels in frontend and native HA selectors without changing
  option IDs or export values;
- Quick Log's manual-owner precedence, one-time remembered defaults and stable
  selection through save/cancel, refresh and presentation-only configuration;
- owner/contact CRUD, puppy links and full-backup inclusion;
- temperature structured-data rendering;
- behavior score validation, partial observations, longitudinal profile
  derivation and PDF output;
- per-kilogram calculator parsing, latest-weight selection, stale-weight
  presentation and non-persistence;
- feeding formulas/tables/age tables, kcal allocation, independent portions and
  atomic per-litter preferences without recording calculated doses or meals;
- shared Dossier, Quick Log and Bulk Log category/schema parity;
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
- explicit frontend composition order without global hooks or prototype patches;
- Workspace preset/editor contracts, shared litter context and inactive-tab
  subscription lifecycle;
- real browser care-result flow from row to dialog to WebSocket save to immediate row removal;
- export selection, care PDF output and runtime selection;
- administrator-only writes/exports/private owner reads, signed URL checks and
  trusted automation services; see [Security and privacy](SECURITY_PRIVACY.md);
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
