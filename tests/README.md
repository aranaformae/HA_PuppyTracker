# Puppy Tracker tests

This directory contains the regression test suite for the **Puppy Tracker** Home Assistant custom integration.

The suite is intended to protect the parts of the integration where a regression could silently change stored puppy data, monitoring results, correction history, exports, or timezone handling.

> The tests use an in-memory Puppy Tracker storage instance. They do **not** read from or write to the `.storage/puppy_tracker` data of a real Home Assistant installation.

## What is tested

The current suite covers the main backend, frontend contract and browser flows.

| Test file | Coverage |
| --- | --- |
| `test_measurements_and_time.py` | Timezone-safe ordering, timestamp normalization, active/deleted/superseded measurements and deterministic sorting |
| `test_metrics.py` | Current/previous weight, weight change, normalized 24-hour growth, monitoring status and per-litter threshold fallback |
| `test_storage_corrections.py` | Non-destructive correction chains, delete/restore behavior and birth-weight synchronization |
| `test_integrity.py` | Safe integrity repairs, duplicate IDs, dangling references and ambiguous correction branches |
| `test_exports.py` | CSV filtering, complete JSON history and direct PDF generation |
| `test_records.py` | Profile-note migration, dossier record CRUD, owner scopes, sorting and integrity checks |
| `test_upcoming.py` | Derived vaccination/deworming follow-ups, due-state classification, filtering and sorting |
| `test_runtime_selection.py` | Typed runtime selection, explicit defaults and archived-selection fallback behavior |
| `test_recurring_reminders.py` | Recurring reminder normalization, owner matching, schedule modes, due status and notification lead-time overrides |
| `test_care_programs.py` / `test_care_occurrences.py` / `test_care_results.py` | Age-based care program validation, deterministic occurrences, result recording and protocol locking |
| `test_age_based_care_notifications.py` / `test_notification_settings_storage.py` | Notification settings, default lead-time fallback, care-program overrides, grouping and delivery contracts |
| `tests/e2e/*.spec.mjs` | Browser coverage for Lovelace cards across Chromium and WebKit projects |

The Python tests protect backend behavior and static frontend contracts. Playwright covers Lovelace-card browser behavior across the configured Chromium/WebKit desktop, iPhone and iPad projects. HACS installation and Home Assistant Companion App push behavior still require manual release testing.

## Requirements

Use a supported Python version for the Home Assistant version you are developing against. A virtual environment is strongly recommended.

From the repository root:

```bash
python -m venv .venv
```

Activate it.

### Linux / macOS

```bash
source .venv/bin/activate
```

### Windows PowerShell

```powershell
.venv\Scripts\Activate.ps1
```

Install the test dependencies:

```bash
python -m pip install --upgrade pip
python -m pip install -r requirements_test.txt
npm ci
npx playwright install chromium webkit
```

`requirements_test.txt` installs:

- `pytest`
- `pytest-homeassistant-custom-component`

The Home Assistant pytest package provides the Home Assistant test harness and fixtures such as `hass` and `enable_custom_integrations`.

## Run all local checks

From the repository root, run the same functional checks locally as CI:

```bash
npm run test:all
```

This runs Python compilation, all backend tests, JavaScript syntax checks and all Chromium/WebKit Playwright projects. The Playwright web server is started automatically.

## Run the backend suite only

From the repository root:

```bash
pytest
```

Or explicitly:

```bash
python -m pytest
```

The repository's `pytest.ini` automatically uses the `tests/` directory and enables automatic asyncio handling.

## Run a specific group of tests

Only metrics:

```bash
pytest tests/test_metrics.py
```

Only correction-chain tests:

```bash
pytest tests/test_storage_corrections.py
```

Only integrity tests:

```bash
pytest tests/test_integrity.py
```

Only exports:

```bash
pytest tests/test_exports.py
```

Only dossier records:

```bash
pytest tests/test_records.py
```

Only derived upcoming dossier actions:

```bash
pytest tests/test_upcoming.py
```

## Run one specific test

For example, the mixed-timezone regression test:

```bash
pytest tests/test_measurements_and_time.py::test_mixed_timezone_measurements_sort_by_instant
```

Or the correction/delete/restore round-trip:

```bash
pytest tests/test_storage_corrections.py::test_correct_delete_restore_round_trip
```

## Useful pytest options

More detail:

```bash
pytest -v
```

Stop after the first failure:

```bash
pytest -x
```

Show more information for failed assertions:

```bash
pytest -vv
```

Run only tests whose name contains a term:

```bash
pytest -k timezone
pytest -k correction
pytest -k export
```

Re-run only the failures from the previous run:

```bash
pytest --lf
```

## Test fixtures

Shared fixtures live in `conftest.py`.

### `storage`

Creates a `PuppyTrackerStorage` instance with fresh in-memory data. `async_save()` is mocked, so tests do not write a Home Assistant storage file.

### `make_measurement`

Creates a complete measurement-version dictionary with concise overrides for fields such as:

- `deleted`
- `superseded_by`
- `source_measurement_id`
- `kind`
- `note`
- `correction_reason`

### `install_litter`

Creates a minimal valid litter and puppy tree directly in the in-memory store. Tests can override litter or puppy fields when a specific scenario is needed.

## Important regression scenarios

### Mixed timezone ordering

A timestamp must be sorted by its actual instant, not by its ISO string.

For example:

```text
2026-08-28 20:35 +02:00 = 18:35 UTC
2026-08-28 19:11 +00:00 = 19:11 UTC
```

The `+02:00` measurement therefore occurred **earlier**, even though its local clock shows a later time.

### Correction history

Corrections are intentionally non-destructive.

```text
A: 400 g
   ↓ correct
B: 420 g
```

`A` remains stored as historical data and points to `B` through `superseded_by`.

Deleting `B` should make `A` active again. Restoring `B` should restore the original chain without creating two active branches.

If the chain changed in the meantime, restore must create a new terminal version rather than introduce an ambiguous branch.

### Integrity repairs

The integrity checker follows a conservative rule:

> Repair automatically only when the intended result is unambiguous.

Dangling successor references can therefore be repaired safely, while duplicate IDs or correction branches remain critical issues for manual investigation.

### Export behavior

The intended distinction is:

- **CSV:** effective active measurements only, optionally filtered to one puppy/period.
- **JSON:** complete technical litter backup, including correction/deletion history and litter audit entries.
- **PDF:** user-facing report generated directly by the backend.

Tests should preserve this distinction.

## Adding a regression test

When fixing a bug, prefer this sequence:

1. Add a test that reproduces the bug.
2. Verify that the test fails against the broken implementation.
3. Implement the fix or refactor.
4. Verify that the new test passes.
5. Run the complete suite to catch unrelated regressions.

Whenever possible, keep tests deterministic. Freeze the current time with `monkeypatch` instead of relying on the actual clock, and use explicit timezone-aware timestamps.

## Before a release

At minimum, run:

```bash
python -m pytest
```

Also validate the production Python and frontend files separately, because the pytest suite does not execute the Lovelace JavaScript cards.

A release should not proceed when a test failure is unexplained. If behavior is intentionally changed, update or replace the relevant regression test in the same commit as that behavior change.

## Troubleshooting

### `ModuleNotFoundError: No module named 'homeassistant'`

Install the test requirements in the active virtual environment:

```bash
python -m pip install -r requirements_test.txt
```

### Custom integration cannot be imported

Run pytest from the repository root so `custom_components/puppy_tracker` is available at the expected path.

### Async fixture or event-loop errors

Use the repository `pytest.ini` and make sure `pytest-homeassistant-custom-component` is installed. The project sets:

```ini
asyncio_mode = auto
```

### Test unexpectedly depends on real time

Patch `homeassistant.util.dt.now()` in the module under test. Existing metrics and export tests demonstrate this pattern.

---

The goal of this suite is not maximum line coverage. Its priority is protecting **data integrity, correction history, monitoring calculations, timezone behavior, and exports** as Puppy Tracker approaches 1.0.


### Measurement timestamp precision regression

Weight-only corrections must preserve the original measurement instant exactly. The
regression suite includes measurements that differ only by seconds/fractional seconds,
as well as measurements with the exact same measurement timestamp. This protects the
`current`/`previous` weight ordering from datetime-local controls that display a lower
precision than the timestamp stored by Home Assistant.


## Dossier record architecture

Puppy Tracker keeps three kinds of information deliberately separate:

- `profile_note`: one editable summary on the puppy profile;
- `records`: chronological dossier entries such as notes, vaccinations, tests, treatments and milestones;
- `measurements`: the specialized weight history with its own correction-chain semantics.

Dossier regression tests verify both litter-scoped and puppy-scoped records. Every record owns its own UUID and stores `occurred_at` separately from `created_at`, so entering an event later does not change when it actually happened.

Record deletion is soft-delete. Tests therefore require delete/restore to preserve the same record identity and content. Ownership metadata may be repaired automatically when the intended owner is unambiguous, but duplicate IDs and invalid record types must remain unresolved integrity findings instead of being guessed.

New dossier modules should prefer a lowercase snake_case `type` and type-specific fields inside the record's `data` mapping. Add a regression test whenever a new record type gains business rules beyond the generic envelope.
