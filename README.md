# Puppy Tracker for Home Assistant

Puppy Tracker is a custom Home Assistant integration for managing litters, mother dogs and individual puppies. Weight tracking remains a first-class module, while the integration also provides chronological dossiers, temperature logging, recurring care reminders, timeline views and safe backup/restore.

> **Development status:** pre-1.0. The current release line is **0.16.x** on the stable `puppy_tracker` integration domain. Breaking changes are still possible before 1.0.

## Highlights

- Manage multiple litters, mother dogs and puppies from Home Assistant.
- Stable UUID-based identities and persistent `.storage` data.
- Dedicated litter, mother and puppy devices.
- Specialised weight tracking with correction history, growth metrics and weighing sessions.
- Generic chronological dossier records for litter, mother and puppy scopes.
- Structured records for notes, temperature, vaccinations, tests, deworming, medication, vet visits, milestones and other events.
- Quick Log for frequent day-to-day entries, including mother-dog and temperature logging.
- Bulk dossier entry for multiple puppies.
- Combined Timeline for weights and dossier history, including mother-dog records.
- Derived vaccination/deworming follow-up actions.
- Generic recurring reminders for a whole litter, mother dog or individual puppy.
- Recurring schedules based on the last matching log, fixed daily times or a one-time due date.
- Automatic reminder completion when a matching dossier record is logged for the same owner.
- Attention card integration for due and overdue care.
- Home Assistant persistent/mobile notifications with deduplication.
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

Puppy Tracker separates profile information, specialised measurements, chronological dossier records and persistent recurring-reminder definitions.

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
└── recurring reminder store
    └── reminders[]
```

Mother dogs are persistent owners rather than duplicated litter text. This allows the same mother profile and dossier to span multiple litters while still allowing records and exports to be filtered by litter context.

### Dossier records

Dossier records are timestamped events. Supported concepts include `note`, `temperature`, `vaccination`, `test`, `deworming`, `medication`, `vet_visit`, `milestone` and `other`.

Weight measurements remain separate because they require correction chains, birth-weight references, charts, effective/current selection and specialised growth calculations.

## Recurring reminders

Recurring reminders are generic care rules. They are deliberately not hard-coded to temperature or medication.

Each reminder has an **owner** (whole litter, mother dog or individual puppy), an action title, a dossier record type that completes the action, an optional exact title match, a schedule, enabled state and derived completion/due information.

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

## Notifications and production testing

Recurring reminders become `due_soon` during the final hour before their deadline and `overdue` after it. The Attention card can show these states independently of notification delivery.

Recurring-reminder notifications currently use Puppy Tracker's existing global notification setting. When notifications are disabled, reminder state and dashboard cards continue to work but no Puppy Tracker persistent/mobile reminder notification is sent.

When notifications are enabled, a Home Assistant persistent notification can be created for due-soon/overdue reminders and configured `notify.*` targets can receive the same reminder. Delivery state is deduplicated so the same status/deadline is not intentionally sent repeatedly.

For first testing on a production Home Assistant instance, keep Puppy Tracker notifications disabled, verify reminder scheduling/completion on the dashboard, and only then enable notifications when desired.

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
| Attention | `custom:puppy-tracker-attention-card` | Weight, care and recurring-reminder attention |
| Litter | `custom:puppy-tracker-litter-card` | Puppy/litter overview |
| Report | `custom:puppy-tracker-report-card` | Reports and CSV/JSON/PDF export, including mother dossier export |
| Dossier | `custom:puppy-tracker-dossier-card` | Litter, mother and puppy dossier records |
| Quick Log | `custom:puppy-tracker-quick-log-card` | Fast litter/mother/puppy care logging |
| Bulk Dossier | `custom:puppy-tracker-bulk-dossier-card` | Add one event to multiple puppies |
| Timeline | `custom:puppy-tracker-timeline-card` | Combined weight + dossier chronology |
| Recurring Reminders | `custom:puppy-tracker-recurring-reminder-card` | Create and manage generic recurring care rules |

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

**Mother scope** is first-class and reusable across litters. Mother records can be logged/viewed through Dossier, Quick Log and Timeline; mother actions can appear on Attention; mother JSON dossier export is available through Report & export; and a mother receives a Home Assistant device.

## Monitoring

Weight monitoring can flag no measurement, overdue weighing, excessive first-day loss, later weight loss and low normalised daily growth. These indicators are monitoring aids, not veterinary diagnoses.

## Reports, backup and restore

- **CSV** is intended for analysis of effective weight measurements.
- **JSON** is the authoritative technical backup/transfer format.
- **PDF** is a user-facing report generated by the backend.

Data management validates imports before writing, provides dry-run previews and remaps identifiers for partial imports. See [`docs/backup-restore.md`](docs/backup-restore.md) for the detailed procedure.

## Repository structure

Important modules now include:

```text
custom_components/puppy_tracker/
├── api.py
├── care_reminders.py
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
    ├── puppy-tracker-quick-log-card.js
    ├── puppy-tracker-timeline-card.js
    ├── puppy-tracker-attention-card.js
    ├── puppy-tracker-report-card.js
    └── puppy-tracker-recurring-reminder-card.js
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for architectural contracts and [`tests/README.md`](tests/README.md) for regression testing.

## Testing

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements_test.txt
pytest
```

CI additionally covers Home Assistant/HACS validation and frontend regression checks. Manual release testing should include a real HACS upgrade, affected cards, mother resolution, recurring-reminder scheduling/completion, notification-off production testing and restart persistence.

## Roadmap to 1.0

The weight, dossier, mother-scope and recurring-care foundations are now in place. Remaining areas include richer treatment/medication workflows, expanded test and vet workflows, deeper analytics, improved reporting, broader automation/calendar integration and further UX refinement.

A dedicated recurring-reminder notification preference is a desirable follow-up so generic reminders can be tested or disabled independently from other Puppy Tracker notification paths.

After a stable **1.0.0** release, the project intends to move to date-based CalVer releases (`YYYY.MM.DD`, with an optional revision suffix for multiple releases on the same day).

## License

See [`LICENSE`](LICENSE).
