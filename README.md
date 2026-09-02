# Puppy Tracker for Home Assistant

Puppy Tracker is a custom Home Assistant integration for managing litters, mother dogs and individual puppies. Weight tracking remains a first-class module, while the integration also provides chronological dossiers, temperature logging, recurring care reminders, age-based care programs, timeline views and safe backup/restore.

> **Development status:** pre-1.0. The current development line is **0.20.x** on the stable `puppy_tracker` integration domain. Breaking changes are still possible before 1.0.

## Highlights

- Manage multiple litters, mother dogs and puppies from Home Assistant.
- Stable UUID-based identities and persistent `.storage` data.
- Dedicated litter, mother and puppy devices.
- Specialised weight tracking with correction history, growth metrics and weighing sessions.
- Per-litter growth-analysis overrides with global fallback; breed and size metadata are stored for future analysis and are not treated as veterinary diagnoses.
- Generic chronological dossier records for litter, mother and puppy scopes.
- Structured records for notes, temperature, vaccinations, tests, deworming, medication, vet visits, milestones and other events.
- Quick Log for frequent day-to-day entries, including mother-dog and temperature logging.
- Bulk dossier entry for multiple puppies.
- Combined Timeline for weights and dossier history, including mother-dog records.
- Derived vaccination/deworming follow-up actions.
- Generic recurring reminders for a whole litter, mother dog or individual puppy.
- Age-based litter care programs with deterministic per-puppy occurrences, including one-time ages and fixed age ranges such as ENS/ESI.
- Structured care-program results stored in the puppy dossier and included in PDF reports.
- Attention and Today integration for upcoming, due-soon, due-today and overdue care.
- Home Assistant persistent/mobile notifications with deduplication.
- Central notification preferences, configurable reminder lead times, an independent recurring-reminder delivery toggle and an explicit test-notification action.
- CSV, JSON and direct PDF reporting/export plus validated backup/restore.
- Built-in Lovelace cards automatically served and registered by the integration.

## Integration identity

```text
Name:        Puppy Tracker
Domain:      puppy_tracker
Component:   custom_components/puppy_tracker/
Storage key: puppy_tracker
WebSocket:   puppy_tracker/*
```

The old prerelease `puppy_weight_tracker` domain is intentionally not kept as a compatibility alias.

## Data model

Puppy Tracker separates profile information, specialised measurements, chronological dossier records and persistent scheduling definitions.

```text
Puppy Tracker
├── main storage
│   ├── mothers[]
│   │   └── Mother
│   │       └── records[]
│   └── litters[]
│       └── Litter
│           ├── mother reference
│           ├── records[]
│           └── puppies[]
│               └── Puppy
│                   ├── profile_note
│                   ├── records[]
│                   └── measurements[]
├── recurring reminder store
│   └── reminders[]
└── age-based care program store
    └── programs[]
```

Mother dogs are persistent owners rather than duplicated litter text. This allows the same mother profile and dossier to span multiple litters while still allowing records and exports to be filtered by litter context.

### Dossier records

Dossier records are timestamped events. Supported concepts include `note`, `temperature`, `vaccination`, `test`, `deworming`, `medication`, `vet_visit`, `milestone` and `other`.

Weight measurements remain separate because they require correction chains, birth-weight references, charts, effective/current selection and specialised growth calculations.

## Recurring reminders

Recurring reminders are generic care rules. They are deliberately not hard-coded to temperature or medication.

Each reminder has an **owner** (whole litter, mother dog or individual puppy), an action title, a dossier record type that completes the action, an optional exact title match, a schedule, enabled state, optional notification lead-time override and derived completion/due information.

### Schedule modes

**From last completion / interval** — best for actions such as measuring temperature every four hours. The next due time is calculated from the actual matching log time. If an action is performed late, the next interval starts from that real completion time.

**Fixed times each day** — use one or more local clock times such as `08:00`, `14:00`, `20:00`. Fixed-time calculations preserve the Home Assistant/local timezone.

**Once** — use one explicit date and time for a one-time action.

### Exact owner matching

A dossier item only completes a reminder for the same owner scope and identity. A temperature record for one puppy therefore cannot complete the mother's temperature reminder, and a mother record cannot complete a whole-litter reminder.

Example:

```text
Owner:       Mother dog · Luna
Action:      Measure temperature
Record type: temperature
Schedule:    From last completion
Interval:    240 minutes
```

Logging a new temperature record for Luna completes the current occurrence and moves the next due time four hours forward.

## Age-based litter care programs

Age-based care programs cover actions whose schedule is anchored to each puppy's age rather than to the previous completion time. They are deliberately separate from recurring reminders because a late or missed action must not shift later age-based occurrences.

Programs are configured per litter and support:

- **Once** — one occurrence at a specific puppy age, for example deworming at day 35.
- **Range** — repeated occurrences between a start and end age with a configurable day interval, for example ENS on days 3–17 or ESI on days 5–17.

The backend derives a deterministic occurrence for every active puppy and scheduled age day from the puppy's `birth_time`. Each occurrence has its own identity, so completing ENS day 7 for one puppy cannot complete another puppy or another age day. Missed or late occurrences never move the remaining calendar.

Today and Attention show open care occurrences as upcoming, due today or overdue. Selecting an occurrence allows it to be recorded as **completed** or **missed**, with optional structured result, score and note fields according to the program configuration. The result is stored as a normal puppy dossier record; occurrence state is not a second results database.

Care notifications use the shared Puppy Tracker notification coordinator and `notify.*` delivery path. Open due-soon, due-today and overdue occurrences are actionable, delivery respects both the global notification setting and the program notification setting, and related puppy actions are grouped to avoid one push per puppy.

## Notifications and production testing

Recurring reminders and clocked age-based care occurrences become `due_soon` within their configured notification lead time and `overdue` after they pass their deadline. The Attention card can show these states independently of notification delivery.

Notification controls are centralized under **Puppy Tracker → Configure → Notifications**. **Notification preferences** contains the existing Puppy Tracker notification controls, the default notification lead time, the shared configured `notify.*` targets and an independent **recurring reminder notifications** toggle. Disabling recurring-reminder delivery does not disable reminder scheduling, completion or Attention-card state, and it does not require disabling the other Puppy Tracker notification paths.

When recurring-reminder notifications are enabled, Home Assistant persistent notifications can be created for due-soon/overdue reminders and configured `notify.*` targets can receive the same reminder. Delivery state is deduplicated so the same status/deadline is not intentionally sent repeatedly.

The default lead time is used when a recurring reminder or age-based care program leaves its own **Notify before / Melding vooraf** value empty. Per-item lead times accept 0 through 10080 minutes, so individual protocols can be silent until the exact due time or notify earlier than the integration default.

**Send test notification** exercises the currently configured notification path on demand. The test remains available independently of the automatic recurring-reminder toggle, is clearly identified as a test and does not create, complete, postpone or otherwise mutate a recurring reminder, dossier entry or reminder-delivery deduplication state. Push/configuration failures are surfaced to the initiating options flow instead of being treated as a successful test.

For first testing on a production Home Assistant instance, automatic recurring-reminder notifications can stay disabled while reminder scheduling/completion is verified on the dashboard. The explicit test action can then verify the chosen delivery targets before automatic recurring delivery is enabled.

## Installation

### HACS

1. Open **HACS → Integrations**.
2. Add this repository as a custom repository if needed.
3. Install **Puppy Tracker**.
4. Restart Home Assistant.
5. Go to **Settings → Devices & services → Add integration**.
6. Search for **Puppy Tracker**.

Repository: `https://github.com/aranaformae/HA_PuppyTracker`

### Manual

Copy `custom_components/puppy_tracker/` to `/config/custom_components/puppy_tracker/`, restart Home Assistant and add Puppy Tracker through **Settings → Devices & services**.

## Dashboard cards

Puppy Tracker automatically registers its frontend modules. A full browser refresh may be required after upgrading.

| Card | Type | Purpose |
| --- | --- | --- |
| Weighing Station | `custom:puppy-tracker-card` | Register weights and weighing sessions |
| Overview | `custom:puppy-tracker-overview-card` | Weight/growth overview and charts |
| Summary | `custom:puppy-tracker-summary-card` | Compact litter summary |
| Today | `custom:puppy-tracker-today-card` | Daily weighing progress and today’s care activity |
| Attention | `custom:puppy-tracker-attention-card` | Weight, recurring-reminder and age-based care attention |
| Litter | `custom:puppy-tracker-litter-card` | Puppy/litter overview |
| Report | `custom:puppy-tracker-report-card` | Reports and CSV/JSON/PDF export, including care-program results |
| Dossier | `custom:puppy-tracker-dossier-card` | Litter, mother and puppy dossier records |
| Quick Log | `custom:puppy-tracker-quick-log-card` | Fast litter/mother/puppy care logging |
| Bulk Dossier | `custom:puppy-tracker-bulk-dossier-card` | Add one event to multiple puppies |
| Timeline | `custom:puppy-tracker-timeline-card` | Combined weight + dossier chronology |
| Recurring Reminders | `custom:puppy-tracker-recurring-reminder-card` | Create and manage generic recurring care rules |
| Care Programs | `custom:puppy-tracker-care-program-card` | Manage age-based litter care programs such as ENS, ESI and age-specific care |

### Recurring reminder card example

```yaml
type: custom:puppy-tracker-recurring-reminder-card
title: Herinneringen
show_litter_selector: true
```

The card lets you select the whole litter, the linked mother dog or an active puppy as owner. In 0.16.1 and later, mother ownership is resolved through the persistent mother scope rather than relying on a `mother_id` field in the normal litter payload.

## Daily-use surfaces

**Quick Log** supports litter, mother and puppy ownership and common structured actions. Temperature is stored as a real `temperature` dossier record with a Celsius value rather than only free text.

**Timeline** is a derived view over authoritative weight and dossier data. It can show litter, mother and puppy dossier history plus effective puppy weight measurements, with filtering and compact/collapsible presentation.

Timeline, Today and Attention expose type/category chips for the items they display. The chips use the same inclusive selection model across cards: **All** selects every available type, while clearing every chip intentionally shows no matching items. Temperature and age-based care entries are included in the available types when those entries exist. Attention and Today keep long lists usable with a scrollable area capped at 520px; Timeline can be configured with `show_timeline_items` to start with its item list shown or hidden while retaining the toggle.

**Today and Attention** consume backend-derived care occurrence state. Open age-based care actions can be completed or marked missed from these surfaces, with configured result/score/note fields stored in the puppy dossier.

**Mother scope** is first-class and reusable across litters. Mother records can be logged/viewed through Dossier, Quick Log and Timeline; mother actions can appear on Attention; mother JSON dossier export is available through Report & export; and a mother receives a Home Assistant device.

Growth-analysis settings are managed per nest through **Manage litter**. Each nest can override the minimum daily growth, weighing interval, monitoring age, first-day loss limit and an optional expected adult-weight range. Empty overrides use the global monitoring settings. Breed profile and size class (including Labradoodle and Australian Labradoodle) are descriptive metadata in this first phase; they do not activate a fixed breed curve.

## Monitoring

Weight monitoring can flag no measurement, overdue weighing, excessive first-day loss, later weight loss and low normalised daily growth. These indicators are monitoring aids, not veterinary diagnoses.

## Reports, backup and restore

- **CSV** is intended for analysis of effective weight measurements.
- **JSON** is the authoritative technical backup/transfer format.
- **PDF** is a user-facing report generated by the backend and includes structured age-based care results for each puppy within the selected report period.

Current full JSON backups use **backup format v5** and include portable age-based care-program and recurring-reminder definitions alongside the authoritative main data. Restore remains backward compatible with production **v4** backups and supports storage schemas **7 and 8**; legacy schema-7 candidates are normalized to the current mother-aware schema before commit. Full v5 restore is coordinated across the main data and scheduler stores with rollback if any store save fails.

Data management validates imports before writing, provides dry-run previews and remaps identifiers for partial imports. Active scheduler ownership is also validated against the authoritative litter, puppy and mother identities before a full v5 backup or restore can be committed. See [`docs/backup-restore.md`](docs/backup-restore.md) for the detailed procedure and compatibility contract.

## Repository structure

Important modules now include:

```text
custom_components/puppy_tracker/
├── api.py
├── care_reminders.py
├── care_programs.py
├── care_occurrences.py
├── care_results.py
├── care_program_api.py
├── notification_delivery.py
├── notification_settings_flow.py
├── recurring_reminders.py
├── recurring_reminder_api.py
├── recurring_notifications.py
├── records.py
├── storage.py
├── upcoming.py
├── notifications.py
├── backup.py
├── pdf_export.py
└── frontend/
    ├── puppy-tracker-dossier-card.js
    ├── puppy-tracker-today-card.js
    ├── puppy-tracker-quick-log-card.js
    ├── puppy-tracker-timeline-card.js
    ├── puppy-tracker-attention-card.js
    ├── puppy-tracker-report-card.js
    ├── puppy-tracker-recurring-reminder-card.js
    ├── puppy-tracker-care-program-card.js
    └── puppy-tracker-care-surfaces.js
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for architectural contracts and [`tests/README.md`](tests/README.md) for regression testing.

## Testing

Install both the Python and frontend test dependencies once:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements_test.txt
npm ci
npx playwright install chromium webkit
```

Run every local check, including Python tests, JavaScript syntax checks and all Playwright browser projects:

```bash
npm run test:all
```

The backend suite can still be run on its own with:

```bash
pytest
```

CI additionally covers Home Assistant/HACS validation. Manual release testing should include a real HACS upgrade, affected cards, mother resolution, recurring-reminder scheduling/completion, age-based care program creation/completion, notification delivery, care-result PDF output and restart persistence.

## Roadmap to 1.0

The weight, dossier, mother-scope, recurring-care, age-based care-program and centralized notification foundations are now in place. Remaining areas include richer treatment/medication workflows, expanded test and vet workflows, deeper analytics, improved reporting, broader automation/calendar integration and further UX refinement.

After a stable **1.0.0** release, the project intends to move to date-based CalVer releases (`YYYY.MM.DD`, with an optional revision suffix for multiple releases on the same day).

## License

See [`LICENSE`](LICENSE).
