"""Backup v5 scheduler envelope compatibility and safety tests."""

from __future__ import annotations

import json
from copy import deepcopy

import pytest

from custom_components.puppy_tracker.backup import (
    BackupValidationError,
    build_export_document,
    parse_export_json,
    prepare_import,
)
from custom_components.puppy_tracker.care_programs import normalize_care_program
from custom_components.puppy_tracker.recurring_reminders import normalize_reminder

CARE_SETTINGS = {
    "lead_days": 7,
    "categories": {"vaccination": True, "deworming": True},
}


def _program() -> dict:
    return normalize_care_program(
        {
            "id": "care-1",
            "revision": 2,
            "litter_id": "litter-1",
            "title": "ENS",
            "record_type": "test",
            "schedule_type": "range",
            "start_age_days": 3,
            "end_age_days": 17,
            "interval_days": 1,
            "time_of_day": "09:00",
            "result_fields": ["result", "score", "note"],
            "created_at": "2026-09-01T08:00:00+02:00",
            "updated_at": "2026-09-01T08:30:00+02:00",
        },
        program_id="care-1",
    )


def _reminder() -> dict:
    return normalize_reminder(
        {
            "id": "reminder-1",
            "enabled": True,
            "title": "Temperatuur meten",
            "owner_scope": "puppy",
            "owner_id": "puppy-1",
            "litter_id": "litter-1",
            "record_type": "temperature",
            "schedule_mode": "fixed_times",
            "fixed_times": ["08:00", "20:00"],
            "start_at": "2026-09-01T08:00:00+02:00",
            "created_at": "2026-09-01T08:00:00+02:00",
            "updated_at": "2026-09-01T08:30:00+02:00",
        },
        reminder_id="reminder-1",
    )


def _scheduler_data() -> dict:
    return {
        "version": 1,
        "care_programs": {
            "programs": {"care-1": _program()},
            "quarantined_programs": {
                "future-care": {"future_schedule": "week_pattern", "raw": [1, 2, 3]}
            },
        },
        "recurring_reminders": {
            "reminders": {"reminder-1": _reminder()},
            "quarantined_reminders": {
                "future-reminder": {"schedule_mode": "cron", "expression": "0 8 * * *"}
            },
        },
    }


def test_v5_full_backup_round_trips_scheduler_snapshots(storage) -> None:
    schedulers = _scheduler_data()
    document = build_export_document(
        storage,
        scope="full",
        care_reminder_settings=CARE_SETTINGS,
        scheduler_data=schedulers,
    )
    parsed = parse_export_json(json.dumps(document))

    assert parsed["export_version"] == 5
    assert parsed["schedulers"] == schedulers
    assert parsed["schedulers"]["care_programs"]["quarantined_programs"]["future-care"][
        "raw"
    ] == [1, 2, 3]


def test_v5_scheduler_active_key_must_match_internal_identifier(storage) -> None:
    schedulers = _scheduler_data()
    schedulers["care_programs"]["programs"] = {"wrong-key": _program()}

    with pytest.raises(BackupValidationError) as err:
        build_export_document(
            storage,
            scope="full",
            care_reminder_settings=CARE_SETTINGS,
            scheduler_data=schedulers,
        )

    assert err.value.code == "invalid_backup"


def test_v5_full_backup_requires_versioned_scheduler_envelope() -> None:
    payload = {
        "export_version": 5,
        "exported_at": "2026-09-01T08:00:00+00:00",
        "integration": "puppy_tracker",
        "schema_version": 7,
        "scope": "full",
        "data": {"schema_version": 7, "litters": {}, "audit_log": []},
        "care_reminders": CARE_SETTINGS,
    }

    with pytest.raises(BackupValidationError) as err:
        parse_export_json(json.dumps(payload))
    assert err.value.code == "invalid_backup"

    payload["schedulers"] = {
        "version": 2,
        "care_programs": {"programs": {}},
        "recurring_reminders": {"reminders": {}},
    }
    with pytest.raises(BackupValidationError) as err:
        parse_export_json(json.dumps(payload))
    assert err.value.code == "unsupported_export_version"


def test_partial_v5_backup_rejects_scheduler_payload(storage, install_litter) -> None:
    litter_id, _puppy_id = install_litter(measurements=[])
    document = build_export_document(storage, scope="litter", litter_id=litter_id)
    document["schedulers"] = {
        "version": 1,
        "care_programs": {"programs": {}},
        "recurring_reminders": {"reminders": {}},
    }

    with pytest.raises(BackupValidationError) as err:
        parse_export_json(json.dumps(document))
    assert err.value.code == "invalid_backup"


def test_full_merge_as_new_refuses_nonempty_scheduler_identity_data(
    storage,
    install_litter,
) -> None:
    install_litter(measurements=[])
    document = build_export_document(
        storage,
        scope="full",
        care_reminder_settings=CARE_SETTINGS,
        scheduler_data=_scheduler_data(),
    )

    with pytest.raises(BackupValidationError) as err:
        prepare_import(storage, document, mode="merge_as_new")
    assert err.value.code == "invalid_import_mode"


def test_v4_replace_plan_preserves_current_scheduler_boundary(storage) -> None:
    payload = {
        "export_version": 4,
        "exported_at": "2026-08-31T00:00:00+00:00",
        "integration": "puppy_tracker",
        "schema_version": 7,
        "scope": "full",
        "data": deepcopy(storage.get_data()),
        "care_reminders": CARE_SETTINGS,
    }
    document = parse_export_json(json.dumps(payload))
    plan = prepare_import(storage, document, mode="replace_all")

    assert plan["summary"]["replaces_all"] is True
    assert plan["summary"]["care_reminders"] == CARE_SETTINGS
    assert "schedulers" not in plan["summary"]
    imported_audit = plan["candidate"]["audit_log"][-1]
    assert imported_audit["details"]["export_version"] == 4
