# Puppy Tracker for Home Assistant

Puppy Tracker is a custom Home Assistant integration for managing litters and individual puppies. It started as a weight tracker, but the project is being redesigned as a broader puppy dossier: weight remains a first-class module, while the storage architecture is being prepared for notes, vaccinations, tests, treatments, milestones, veterinary visits and other puppy or litter events.

> **Development status:** pre-1.0. Version `0.11.0` introduces the first usable dossier workflow on the stable `puppy_tracker` integration domain. Breaking changes are still possible before 1.0.

## Highlights

- Manage multiple litters and puppies from the Home Assistant UI.
- Stable UUID-based litter and puppy identity.
- Birth date/time, sex, collar colour, birth weight and profile note.
- Persistent data in Home Assistant `.storage`.
- Non-destructive measurement corrections with history.
- Soft-delete and restore for measurements.
- Timezone-safe ordering with second-level timestamp precision.
- Current, previous and 24-hour growth metrics.
- Configurable puppy monitoring and attention states.
- Weighing sessions optimised for phone and tablet use.
- Persistent notifications with recovery handling.
- Storage-backed charts; no Recorder dependency for Puppy Tracker history.
- CSV, JSON and direct PDF export.
- Data-integrity checks and Home Assistant diagnostics.
- Built-in Lovelace cards automatically served by the integration.
- Generic dossier-record storage and WebSocket API for puppy and litter dossier items.
- Type-specific dossier forms for notes, vaccinations, tests, deworming, medication, vet visits, milestones and other records.
- Derived upcoming dossier actions from vaccination and deworming follow-up dates.
- Regression test suite for measurements, metrics, corrections, integrity, exports, runtime selection, dossier records and upcoming actions.

## Integration identity

The `0.11.x` development line uses the general-purpose Puppy Tracker identity:

```text
Name:        Puppy Tracker
Domain:      puppy_tracker
Component:   custom_components/puppy_tracker/
Storage key: puppy_tracker
WebSocket:   puppy_tracker/*
```

The old prerelease `puppy_weight_tracker` domain is intentionally not kept as a compatibility alias. If you tested an older prerelease, remove that custom integration and install Puppy Tracker cleanly.

## Data model

Puppy Tracker separates relatively static profile information, chronological dossier events and high-frequency weight measurements.

```text
Litter
├── litter profile
├── records[]                 chronological litter dossier
└── puppies[]
    └── Puppy
        ├── profile_note      one persistent summary
        ├── records[]         chronological puppy dossier
        └── measurements[]    specialised weight history
```

### Profile note

`profile_note` is one editable, persistent summary for a puppy. It is intended for information such as appearance, temperament or other lasting context.

### Dossier records

Dossier records are separate timestamped entries. The storage foundation supports litter- and puppy-scoped records and is designed for future types such as:

- `note`
- `vaccination`
- `test`
- `deworming`
- `medication`
- `vet_visit`
- `milestone`
- future snake_case record types

The `0.11.x` line includes storage, WebSocket APIs and a dashboard dossier card with type-specific forms for the initial record types. Unknown future snake_case record types are preserved and displayed generically.

### Upcoming dossier actions

Puppy Tracker derives upcoming actions from active dossier records instead of storing a separate task list. The first supported follow-up fields are:

```text
vaccination.data.next_due_date
deworming.data.next_due_date
```

Date-only follow-ups are treated as Home Assistant local calendar dates. Derived statuses are `overdue`, `due_today` and `upcoming`.

### Weight measurements

Weight measurements remain separate from generic dossier records because they require specialised behaviour: correction chains, charts, current/previous calculations, 24-hour growth metrics and frequent time-series access.

## Installation

### HACS

When available through HACS:

1. Open **HACS → Integrations**.
2. Add the Puppy Tracker repository as a custom repository if needed.
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

## Dashboard cards

The integration automatically registers its frontend modules. No manual Lovelace resource entry should be required.

Current card types:

```yaml
type: custom:puppy-tracker-card
```

```yaml
type: custom:puppy-tracker-overview-card
```

```yaml
type: custom:puppy-tracker-summary-card
```

```yaml
type: custom:puppy-tracker-attention-card
```

```yaml
type: custom:puppy-tracker-litter-card
```

```yaml
type: custom:puppy-tracker-report-card
```

```yaml
type: custom:puppy-tracker-dossier-card
```

### Example dashboard

```yaml
type: vertical-stack
cards:
  - type: custom:puppy-tracker-summary-card
    title: Nestoverzicht
    show_litter_selector: true

  - type: custom:puppy-tracker-attention-card
    title: Aandacht
    show_litter_selector: true

  - type: custom:puppy-tracker-litter-card
    title: Pups
    active_only: true
    default_sort: name

  - type: custom:puppy-tracker-card
    title: Weegstation

  - type: custom:puppy-tracker-overview-card
    title: Groei
    default_range: 7d
    default_metric: weight

  - type: custom:puppy-tracker-report-card
    title: Rapport & export
    default_range: all

  - type: custom:puppy-tracker-dossier-card
    title: Puppydossier
    show_litter_selector: true
    show_profile_note: true
```

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

Measurement ordering uses timezone-aware timestamps with seconds. Editing only a weight preserves the original timestamp instead of rounding it to the minute.

## Monitoring

Puppy Tracker can flag conditions including:

- no measurement yet;
- overdue weighing;
- excessive loss during the first 24 hours;
- weight loss after the first day;
- low normalised daily growth during the configured monitoring period.

Monitoring thresholds are configurable. These indicators are monitoring aids, not veterinary diagnoses.

## Notifications

The integration can create Home Assistant persistent notifications and optionally send notifications through a configured notify target. Alert state is deduplicated and can generate a recovery notification when a puppy returns to an OK state.

## Exports

### CSV

CSV is intended for spreadsheet analysis and contains effective active measurements. It can be filtered by puppy and period.

### JSON

JSON is the technical backup format. It retains full litter data including historical measurement versions, soft-deleted items, dossier records and audit information.

### PDF

PDF reports are generated directly by the Home Assistant backend and downloaded as real PDF files. This avoids browser print-dialog limitations in the Home Assistant iOS/iPadOS WebView.

## Data integrity and diagnostics

Puppy Tracker performs conservative storage validation. Automatic repairs are made only when the intended result is unambiguous.

Examples of checked conditions include:

- duplicate measurement or record IDs;
- dangling correction references;
- correction cycles and ambiguous branches;
- invalid timestamps or weights;
- birth-weight/profile consistency;
- invalid dossier record ownership, scope or delete state.

A manual integrity check is available from the integration options. Home Assistant diagnostics are privacy-conscious and summarise structure/status rather than exposing free-form user content unnecessarily.

## Services

The integration currently exposes Home Assistant services for core litter/pup/weight operations, including:

```text
puppy_tracker.create_litter
puppy_tracker.add_puppy
puppy_tracker.record_weight
```

The `add_puppy` service includes `profile_note`. Dossier records are managed through the Puppy Tracker WebSocket API and the built-in dossier dashboard card.

## Repository structure

```text
custom_components/puppy_tracker/
├── __init__.py
├── api.py
├── binary_sensor.py
├── button.py
├── config_flow.py
├── const.py
├── devices.py
├── diagnostics.py
├── frontend.py
├── frontend/
│   ├── puppy-tracker-card-common.js
│   ├── puppy-tracker-card.js
│   ├── puppy-tracker-overview-card.js
│   ├── puppy-tracker-summary-card.js
│   ├── puppy-tracker-attention-card.js
│   ├── puppy-tracker-litter-card.js
│   ├── puppy-tracker-report-card.js
│   └── puppy-tracker-dossier-card.js
├── integrity.py
├── manifest.json
├── measurements.py
├── metrics.py
├── notifications.py
├── number.py
├── pdf_export.py
├── records.py
├── runtime.py
├── select.py
├── sensor.py
├── services.yaml
├── session.py
├── storage.py
├── strings.json
├── time_utils.py
├── upcoming.py
└── translations/
```

Development files:

```text
requirements_test.txt
pytest.ini
tests/
└── README.md
```

See [`tests/README.md`](tests/README.md) for the regression test suite and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the architectural direction.

## Testing

Create a virtual environment and install the test requirements:

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements_test.txt
pytest
```

On Windows PowerShell, activate with:

```powershell
.venv\Scripts\Activate.ps1
```

The test suite protects timezone ordering, metrics, correction chains, integrity repairs, exports, runtime selection, dossier-record behaviour and derived upcoming actions.

Manual release testing should additionally cover HACS installation, integration setup, all Lovelace cards, phone/tablet interaction, direct PDF download and Home Assistant restart persistence.

## Roadmap

The architecture is intentionally moving beyond weight-only tracking. Planned areas include:

- quick notes from the dashboard;
- richer care views for vaccinations, deworming and medication;
- health summaries and upcoming-care dashboards;
- dossier notifications for due and overdue actions;
- timeline filtering by record type;
- expanded test results, veterinary visits and milestone workflows;
- attachments/documents where useful;
- richer puppy dossier reports for new owners;
- further frontend simplification and automated end-to-end testing;
- 1.0 stable milestone after the prerelease architecture settles.

## Development philosophy

Puppy Tracker follows a few core rules:

1. Do not silently discard historical puppy data.
2. Preserve timestamps and identity precisely.
3. Prefer explicit, typed domain logic over frontend heuristics.
4. Repair stored data automatically only when the intended result is certain.
5. Keep weight-specific time-series logic separate from the generic puppy dossier.
6. Add regression tests whenever a real bug is fixed.
7. Keep the architecture extensible enough that new puppy-care modules do not require redesigning the core storage model.

## License and support

Use the GitHub issue tracker for bugs and feature requests:

```text
https://github.com/aranaformae/HA_PuppyTracker/issues
```
