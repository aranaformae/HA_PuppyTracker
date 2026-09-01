"""Backup compatibility tests across base schema 7 and mother-aware schema 8."""

from __future__ import annotations

import json
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.backup import (
    BackupValidationError,
    build_export_document,
    parse_export_json,
    prepare_import,
)
from custom_components.puppy_tracker.mother_schema import migrate_mother_scope_data
from custom_components.puppy_tracker.mother_storage_integrity import MotherScopeIntegrityStorage

CARE_SETTINGS = {
    "lead_days": 5,
    "categories": {"vaccination": True, "deworming": False},
}
EMPTY_SCHEDULERS = {
    "version": 1,
    "care_programs": {"programs": {}},
    "recurring_reminders": {"reminders": {}},
}


def _runtime_storage(hass, data: dict) -> MotherScopeIntegrityStorage:
    runtime = MotherScopeIntegrityStorage(hass)
    runtime._data = deepcopy(data)
    migrate_mother_scope_data(runtime._data)
    runtime._data["schema_version"] = 8
    runtime.async_save = AsyncMock()
    runtime._store.async_save = AsyncMock()
    return runtime


def _empty_runtime_storage(hass, data: dict) -> MotherScopeIntegrityStorage:
    empty = deepcopy(data)
    empty["litters"] = {}
    empty["audit_log"] = []
    empty.pop("mothers", None)
    return _runtime_storage(hass, empty)


def test_schema8_runtime_full_backup_is_accepted(
    hass,
    storage,
    install_litter,
) -> None:
    install_litter(measurements=[])
    source = _runtime_storage(hass, storage.get_data())

    document = build_export_document(
        source,
        scope="full",
        care_reminder_settings=CARE_SETTINGS,
        scheduler_data=EMPTY_SCHEDULERS,
    )

    assert document["schema_version"] == 8
    assert document["data"]["schema_version"] == 8
    assert document["data"]["mothers"]

    parsed = parse_export_json(json.dumps(document))
    target = _empty_runtime_storage(hass, storage.get_data())
    plan = prepare_import(target, parsed, mode="replace_all")

    candidate = plan["candidate"]
    litter = candidate["litters"]["litter-1"]
    mother_id = litter["mother_id"]
    assert candidate["schema_version"] == 8
    assert candidate["mothers"][mother_id]["name"] == "Luna"


def test_legacy_v4_schema7_full_backup_migrates_to_schema8(
    hass,
    storage,
    install_litter,
) -> None:
    install_litter(measurements=[])
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
    target = _empty_runtime_storage(hass, storage.get_data())
    plan = prepare_import(target, document, mode="replace_all")

    candidate = plan["candidate"]
    litter = candidate["litters"]["litter-1"]
    mother_id = litter["mother_id"]
    assert plan["summary"]["schema_version"] == 7
    assert candidate["schema_version"] == 8
    assert candidate["mothers"][mother_id]["name"] == "Luna"


def test_future_storage_schema_is_rejected(storage) -> None:
    payload = {
        "export_version": 5,
        "exported_at": "2026-09-01T00:00:00+00:00",
        "integration": "puppy_tracker",
        "schema_version": 9,
        "scope": "full",
        "data": {**storage.get_data(), "schema_version": 9},
        "care_reminders": CARE_SETTINGS,
        "schedulers": EMPTY_SCHEDULERS,
    }

    with pytest.raises(BackupValidationError) as err:
        parse_export_json(json.dumps(payload))

    assert err.value.code == "unsupported_schema_version"


def test_schema8_candidate_rejects_unknown_mother_without_recovery_name(
    hass,
    storage,
    install_litter,
) -> None:
    install_litter(measurements=[])
    source = _runtime_storage(hass, storage.get_data())
    broken = source.get_data()
    broken["mothers"] = {}
    broken["litters"]["litter-1"]["mother"] = None
    broken["litters"]["litter-1"]["mother_id"] = "missing-mother"

    document = {
        "export_version": 5,
        "exported_at": "2026-09-01T00:00:00+00:00",
        "integration": "puppy_tracker",
        "schema_version": 8,
        "scope": "full",
        "data": broken,
        "care_reminders": CARE_SETTINGS,
        "schedulers": EMPTY_SCHEDULERS,
    }
    parsed = parse_export_json(json.dumps(document))
    target = _empty_runtime_storage(hass, storage.get_data())

    with pytest.raises(BackupValidationError) as err:
        prepare_import(target, parsed, mode="replace_all")

    assert err.value.code == "invalid_backup"
