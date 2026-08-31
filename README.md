# Puppy Tracker for Home Assistant

Puppy Tracker is a custom Home Assistant integration for managing litters and individual puppies. Weight tracking remains a first-class module, but Puppy Tracker has grown into a broader puppy dossier with chronological care records, reminders, timeline views and safe backup/restore.

> **Development status:** pre-1.0. The current development release is **0.14.1** on the stable `puppy_tracker` integration domain. Breaking changes are still possible before 1.0.

## Highlights

- Manage multiple litters and puppies from the Home Assistant UI.
- Stable UUID-based litter and puppy identity.
- Birth date/time, sex, collar colour, birth weight and persistent profile note.
- Persistent data in Home Assistant `.storage`.
- Dedicated litter and puppy devices/entities.
- Non-destructive weight corrections with full history.
- Soft-delete and restore for measurements and dossier records.
- Current, previous and normalised 24-hour growth metrics.
- Configurable weighing thresholds, attention states and notifications.
- Weighing sessions optimised for phone and tablet use.
- Generic chronological dossier records for puppy and litter events.
- Structured forms for notes, vaccinations, tests, deworming, medication, vet visits, milestones and other records.
- Derived upcoming care from vaccination and deworming follow-up dates.
- Deduplicated vaccination/deworming care reminders with restart-safe state.
- Quick Log for fast day-to-day entries.
- Bulk dossier entry for registering one event for multiple puppies.
- Combined Timeline with weights and dossier history in one filterable view.
- CSV, JSON and direct PDF export.
- Full, litter and individual-puppy JSON backup/export from integration configuration.
- Validated JSON import/restore with dry-run preview, UUID remapping and atomic writes.
- Data-integrity checks and privacy-conscious Home Assistant diagnostics.
- Built-in Lovelace cards automatically served and registered by the integration.
- Browser regression tests across desktop Chromium and iPhone/iPad WebKit profiles.

## Integration identity

```text
Name:        Puppy Tracker
Domain:      puppy_tracker
Component:   custom_components/puppy_tracker/
Storage key: puppy_tracker
WebSocket:   puppy_tracker/*
```

The old prerelease `puppy_weight_tracker` domain is intentionally not kept as a compatibility alias. If you tested a very early prerelease, remove that custom integration and install Puppy Tracker cleanly.

## Data model

Puppy Tracker deliberately separates relatively static profile information, chronological dossier events and high-frequency weight measurements.

```text
Puppy Tracker storage
└── Litter
    ├── litter profile
    ├── records[]                 chronological litter dossier
    └── puppies[]
        └── Puppy
            ├── profile_note      persistent summary
            ├── records[]         chronological puppy dossier
            └── measurements[]    specialised weight history
```

### Profile note

`profile_note` is one editable persistent summary for a puppy. It is intended for lasting context such as appearance, temperament or other useful background information.

### Dossier records

Dossier records are separate timestamped entries. Current record types include:

- `note`
- `vaccination`
- `test`
- `deworming`
- `medication`
- `vet_visit`
- `milestone`
- `other`

Unknown future snake_case record types are preserved instead of discarded, which keeps the storage model extensible for later puppy-care modules.

### Upcoming care and reminders

Puppy Tracker derives upcoming care from active dossier records instead of maintaining a second task database. The first supported follow-up fields are:

```text
vaccination.data.next_due_date
deworming.data.next_due_date
```

Date-only follow-ups use the Home Assistant local calendar date. Upcoming care can become `upcoming`, `due_today` or `overdue`.

Vaccination and deworming reminders are independently configurable from weight monitoring. Reminder delivery is deduplicated, persists across Home Assistant restarts and can notify through Home Assistant persistent notifications and configured `notify.*` targets.

### Weight measurements

Weight measurements remain separate from generic dossier records because they require specialised behaviour: correction chains, effective/current measurements, birth-weight references, charts, growth calculations and frequent time-series access.

## Installation

### HACS

1. Open **HACS → Integrations**.
2. Add this repository as a custom repository if needed.
3. Install **Puppy Tracker**.
4. Restart Home Assistant.
5. Go to **Settings → Devices & services → Add integration**.
6. Search for **Puppy Tracker**.

Repository:

```text
https://github.com/aranaformae/HA_PuppyTracker
```

### Manual

Copy the complete folder:

```text
custom_components/puppy_tracker/
```

into:

```text
/config/custom_components/puppy_tracker/
```

Restart Home Assistant and add **Puppy Tracker** through **Settings → Devices & services**.

## Integration configuration

Open:

**Settings → Devices & services → Puppy Tracker → Configure**

The integration configuration contains litter/puppy management, monitoring settings, care-reminder settings, integrity tools and **Data management**.

### Data management

Data management provides authoritative JSON export/import without relying on a dashboard card.

Available exports:

- **Complete Puppy Tracker backup** — all litters, puppies, settings, measurement versions, dossier records and audit history.
- **One complete litter** — one litter with all puppies and associated history.
- **One individual puppy** — profile, birth measurement reference, complete measurement/correction history, dossier records, relevant audit history and source-litter metadata.

Export links are short-lived signed Home Assistant download URLs and expire after 10 minutes. Backup files are not left behind in `/www`.

Import/restore always follows a safety flow:

1. Upload the JSON file.
2. Validate export version, storage schema and structure.
3. Choose the import mode/destination.
4. Build and integrity-check the candidate database in memory.
5. Review the dry-run preview.
6. Explicitly confirm the import.
7. Save atomically.

Partial imports receive new litter, puppy, measurement and dossier identifiers. Internal references such as correction chains and birth-measurement links are remapped together, so an imported puppy cannot silently overwrite existing history.

A single puppy can be imported into an **existing litter** or into a **new litter** created from the source-litter metadata. Full disaster-recovery restore can intentionally replace the complete Puppy Tracker database while preserving source identifiers.

See [`docs/backup-restore.md`](docs/backup-restore.md) for the full backup, restore and puppy-transfer procedure.

## Dashboard cards

Puppy Tracker automatically serves and registers its frontend modules. No manual Lovelace resource entry should be required.

Current card types:

| Card | Type | Purpose |
| --- | --- | --- |
| Weighing Station | `custom:puppy-tracker-card` | Register weights and run weighing sessions |
| Overview | `custom:puppy-tracker-overview-card` | Weight/growth overview and charts |
| Summary | `custom:puppy-tracker-summary-card` | Compact litter summary |
| Attention | `custom:puppy-tracker-attention-card` | Puppies that need attention |
| Litter | `custom:puppy-tracker-litter-card` | Puppy/litter overview |
| Report | `custom:puppy-tracker-report-card` | Reports and CSV/JSON/PDF export |
| Dossier | `custom:puppy-tracker-dossier-card` | Puppy profile and structured dossier records |
| Quick Log | `custom:puppy-tracker-quick-log-card` | Fast timestamped notes/care entries |
| Bulk Dossier | `custom:puppy-tracker-bulk-dossier-card` | Add an event to multiple puppies |
| Timeline | `custom:puppy-tracker-timeline-card` | Combined weight + dossier chronology |

New cards should also appear in Home Assistant's card picker. If Home Assistant was already open while upgrading Puppy Tracker, a full browser refresh may be needed before a newly registered card appears.

### Example Sections dashboard

```yaml
title: Puppy Tracker
views:
  - title: Puppy Tracker
    path: puppy-tracker
    icon: mdi:dog
    type: sections
    max_columns: 4

    sections:
      - type: grid
        title: Overview
        cards:
          - type: custom:puppy-tracker-summary-card
            title: Litter overview
            show_litter_selector: true

          - type: custom:puppy-tracker-attention-card
            title: Attention
            show_litter_selector: true

      - type: grid
        title: Puppies & weight
        cards:
          - type: custom:puppy-tracker-litter-card
            title: Puppies
            active_only: true
            default_sort: name

          - type: custom:puppy-tracker-card
            title: Weighing station

          - type: custom:puppy-tracker-overview-card
            title: Growth
            default_range: 7d
            default_metric: weight
            show_summary: true
            show_puppy_cards: true

      - type: grid
        title: Register
        cards:
          - type: custom:puppy-tracker-quick-log-card
            title: Quick Log
            show_litter_selector: true

          - type: custom:puppy-tracker-bulk-dossier-card
            title: Bulk dossier
            show_litter_selector: true

      - type: grid
        title: Dossier
        cards:
          - type: custom:puppy-tracker-dossier-card
            title: Puppy dossier
            show_litter_selector: true
            show_profile_note: true

          - type: custom:puppy-tracker-timeline-card
            title: Timeline
            show_litter_selector: true
            default_scope: litter
            max_items: 250
            show_history_toggle: true

      - type: grid
        title: Reporting
        cards:
          - type: custom:puppy-tracker-report-card
            title: Report & export
            default_range: all
```

## Quick Log

Quick Log is intended for frequent day-to-day use. It supports litter- or puppy-scoped entries with an editable current timestamp and presets for common actions such as notes, feeding, stool/urine, medication and milestones.

The card keeps an unfinished draft while Puppy Tracker receives live updates, which is useful during active litter care.

## Bulk dossier entry

The Bulk Dossier card allows one structured event to be registered for multiple selected puppies. Each selected puppy receives its own dossier record, preserving individual ownership/history while avoiding repetitive data entry.

## Timeline

The Timeline is a derived view over the existing authoritative measurement and dossier data; it does not create a second timeline database.

It can combine:

- active/effective weight measurements;
- litter dossier records;
- puppy dossier records;
- optional deleted/superseded history for users with management rights.

The view supports litter or individual-puppy scope, event-type filters, date range filtering and newest-first ordering by the actual event/measurement time.

## Weighing workflow

The weighing station provides litter and puppy selection, a weight input and session controls. A session snapshots the active puppies and tracks progress as puppies are weighed.

Duplicate protection helps prevent accidental double entries. Completed sessions are retained as summary information.

## Measurement history and corrections

Corrections are non-destructive.

```text
A: 400 g
   ↓ correct
B: 420 g
```

`A` remains stored as historical data and points to `B`. Deleting `B` makes the previous valid version active again. Restoring a deleted correction never intentionally creates an ambiguous branch.

Measurement ordering uses timezone-aware timestamps with second-level precision. Editing only a weight preserves the original timestamp instead of rounding it to the minute.

## Monitoring

Puppy Tracker can flag conditions including:

- no measurement yet;
- overdue weighing;
- excessive loss during the first 24 hours;
- weight loss after the first day;
- low normalised daily growth during the configured monitoring period.

Monitoring thresholds are configurable. These indicators are monitoring aids, not veterinary diagnoses.

## Notifications

Puppy Tracker has two related but separate notification paths:

- **Weight monitoring alerts** for puppy attention states, including optional recovery notifications.
- **Care reminders** for vaccination/deworming follow-up dates.

Both use deduplicated state so repeated updates or Home Assistant restarts do not intentionally spam the same notification state.

## Reports and exports

### CSV

CSV is intended for spreadsheet analysis and contains effective active measurements. It can be filtered by puppy and period.

### JSON

JSON is the authoritative technical backup/transfer format. Current backup export version is **3**. The restore workflow can also accept the previous version 2 litter JSON format when its schema can be validated safely.

Use **Data management** in the integration configuration for full, litter and single-puppy backup/restore workflows.

### PDF

PDF reports are generated directly by the Home Assistant backend and downloaded as real PDF files, avoiding browser print-dialog limitations in Home Assistant iOS/iPadOS WebViews.

## Data integrity and diagnostics

Puppy Tracker performs conservative storage validation. Automatic repairs are made only when the intended result is unambiguous.

Examples of checked conditions include:

- duplicate measurement or record IDs;
- dangling correction references;
- correction cycles and ambiguous branches;
- invalid timestamps or weights;
- birth-weight/profile consistency;
- invalid dossier record ownership, scope or delete state.

A manual integrity check is available from the integration configuration. Home Assistant diagnostics are privacy-conscious and summarise structure/status rather than unnecessarily exposing free-form user content.

## Services and API

The integration exposes Home Assistant services for core litter/pup/weight operations, including:

```text
puppy_tracker.create_litter
puppy_tracker.add_puppy
puppy_tracker.record_weight
```

The `add_puppy` service supports `profile_note`. Richer dashboard workflows use the Puppy Tracker WebSocket API, while the normal Home Assistant entities remain available for automations and monitoring.

## Repository structure

Important runtime modules:

```text
custom_components/puppy_tracker/
├── __init__.py
├── api.py
├── backup.py
├── backup_http.py
├── care_reminders.py
├── config_flow.py
├── config_flow_management.py
├── data_management_flow.py
├── diagnostics.py
├── frontend.py
├── integrity.py
├── measurements.py
├── metrics.py
├── notifications.py
├── pdf_export.py
├── records.py
├── runtime.py
├── storage.py
├── upcoming.py
└── frontend/
    ├── puppy-tracker-card-common.js
    ├── puppy-tracker-card.js
    ├── puppy-tracker-overview-card.js
    ├── puppy-tracker-summary-card.js
    ├── puppy-tracker-attention-card.js
    ├── puppy-tracker-litter-card.js
    ├── puppy-tracker-report-card.js
    ├── puppy-tracker-dossier-card.js
    ├── puppy-tracker-quick-log-card.js
    ├── puppy-tracker-bulk-dossier-card.js
    ├── puppy-tracker-timeline-card.js
    └── puppy-tracker-localization-bridge.js
```

Development/documentation:

```text
docs/
requirements_test.txt
pytest.ini
tests/
```

See [`tests/README.md`](tests/README.md) for the regression suite, [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the architectural direction and [`docs/backup-restore.md`](docs/backup-restore.md) for backup/restore procedures.

## Testing

Create a virtual environment and install the test requirements:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements_test.txt
pytest
```

On Windows PowerShell:

```powershell
.venv\Scripts\Activate.ps1
```

CI currently validates:

- Python/backend regression tests;
- Home Assistant Hassfest validation;
- HACS validation;
- integration metadata/version consistency;
- frontend JavaScript syntax;
- Playwright browser E2E tests across desktop Chromium, iPhone WebKit and iPad WebKit profiles.

Manual release testing should additionally cover a real HACS upgrade, integration configuration, Data management downloads/import preview, all Lovelace cards, phone/tablet interaction and Home Assistant restart persistence.

## Roadmap to 1.0

The weight-tracking and generic dossier foundations are now in place. Remaining planned areas include:

- medication courses and richer treatment workflows;
- expanded test-result, vet-visit and milestone workflows;
- feeding/basic daily-care tracking;
- deeper weight analytics;
- further weighing-station UX improvements;
- richer puppy/litter detail cards;
- breeder/new-owner PDF reports;
- broader Home Assistant automation/services/events/calendar integration;
- migration regression coverage for older storage versions;
- project/release hygiene required for the 1.0 milestone;
- later: attachments/documents and puppy handoff/transfer workflows beyond JSON backup transfer.

After a stable **1.0.0** release, the project intends to move from SemVer prerelease development to date-based CalVer releases (`YYYY.MM.DD`, with an optional revision suffix for multiple releases on the same day).

## Development philosophy

Puppy Tracker follows a few core rules:

1. Do not silently discard historical puppy data.
2. Preserve timestamps and identity precisely.
3. Prefer explicit, typed domain logic over frontend heuristics.
4. Repair stored data automatically only when the intended result is certain.
5. Keep weight-specific time-series logic separate from the generic puppy dossier.
6. Add regression tests whenever a real bug is fixed.
7. Preview destructive/import operations before writing data.
8. Keep the architecture extensible enough that new puppy-care modules do not require redesigning the core storage model.

## License and support

Use the GitHub issue tracker for bugs and feature requests:

```text
https://github.com/aranaformae/HA_PuppyTracker/issues
```
