"""Tests for validated Puppy Tracker JSON backup and restore."""

from __future__ import annotations

import json
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.backup import (
    BackupValidationError,
    async_apply_import,
    build_export_document,
    parse_export_json,
    prepare_import,
    serialize_export,
)


def _puppy_record(
    record_id: str,
    litter_id: str,
    puppy_id: str,
) -> dict:
    return {
        "id": record_id,
        "type": "vaccination",
        "scope": "puppy",
        "litter_id": litter_id,
        "puppy_id": puppy_id,
        "occurred_at": "2026-08-29T09:00:00+00:00",
        "created_at": "2026-08-29T09:00:00+00:00",
        "updated_at": "2026-08-29T09:00:00+00:00",
        "deleted": False,
        "deleted_at": None,
        "title": "Vaccination",
        "note": "First vaccination",
        "data": {"vaccine": "ExampleVac", "next_due_date": "2026-09-19"},
    }


def _install_consistent_source(storage, install_litter, make_measurement):
    birth = make_measurement(
        "birth-1",
        400,
        "2026-08-28T10:00:00+00:00",
        kind="birth",
        note="Geboortegewicht",
    )
    old = make_measurement(
        "weight-old",
        430,
        "2026-08-29T10:00:00+00:00",
        superseded_by="weight-new",
    )
    corrected = make_measurement(
        "weight-new",
        440,
        "2026-08-29T10:00:00+00:00",
        source_measurement_id="weight-old",
        correction_reason="Scale check",
    )
    litter_id, puppy_id = install_litter(
        measurements=[birth, old, corrected],
        puppy_overrides={
            "birth_measurement_id": "birth-1",
            "records": [_puppy_record("record-1", "litter-1", "puppy-1")],
        },
    )
    storage._data["audit_log"] = [
        {
            "timestamp": "2026-08-29T10:05:00+00:00",
            "action": "correct_measurement",
            "litter_id": litter_id,
            "puppy_id": puppy_id,
            "measurement_id": "weight-old",
            "details": {"replacement_measurement_id": "weight-new"},
        }
    ]
    return litter_id, puppy_id


async def test_full_export_and_replace_restore_preserves_identifiers(
    storage,
    install_litter,
    make_measurement,
) -> None:
    litter_id, puppy_id = _install_consistent_source(
        storage,
        install_litter,
        make_measurement,
    )
    original = deepcopy(storage.get_data())
    _filename, mime, content = serialize_export(storage, scope="full")
    document = parse_export_json(content)

    assert mime == "application/json;charset=utf-8"
    storage._data["litters"] = {}
    plan = prepare_import(storage, document, mode="replace_all")

    assert storage.get_litters() == {}
    assert plan["summary"]["replaces_all"] is True
    assert plan["summary"]["puppies"] == 1
    assert plan["summary"]["measurements"] == 3

    await async_apply_import(storage, plan)

    restored = storage.get_puppy(litter_id, puppy_id)
    assert restored is not None
    assert restored["birth_measurement_id"] == "birth-1"
    assert {item["id"] for item in restored["measurements"]} == {
        "birth-1",
        "weight-old",
        "weight-new",
    }
    assert original["litters"][litter_id]["puppies"][puppy_id]["name"] == restored["name"]


async def test_puppy_export_import_into_existing_litter_remaps_all_identifiers(
    storage,
    install_litter,
    make_measurement,
) -> None:
    source_litter_id, source_puppy_id = _install_consistent_source(
        storage,
        install_litter,
        make_measurement,
    )
    target_litter_id, _ = install_litter(
        litter_id="target-litter",
        puppy_id="target-existing-puppy",
        measurements=[],
        puppy_overrides={
            "birth_weight": None,
            "birth_time": None,
            "birth_measurement_id": None,
        },
        litter_overrides={"name": "Target litter"},
    )

    _filename, _mime, content = serialize_export(
        storage,
        scope="puppy",
        litter_id=source_litter_id,
        puppy_id=source_puppy_id,
    )
    document = parse_export_json(content)
    before = deepcopy(storage.get_data())

    plan = prepare_import(
        storage,
        document,
        mode="existing_litter",
        target_litter_id=target_litter_id,
    )

    # Preview is a true dry run.
    assert storage.get_data() == before

    await async_apply_import(storage, plan)

    imported_puppy_id = plan["summary"]["imported_puppy_id"]
    assert imported_puppy_id != source_puppy_id

    imported = storage.get_puppy(target_litter_id, imported_puppy_id)
    assert imported is not None
    imported_measurements = {item["id"]: item for item in imported["measurements"]}

    assert not {"birth-1", "weight-old", "weight-new"} & set(imported_measurements)
    assert imported["birth_measurement_id"] in imported_measurements

    corrected = next(
        item
        for item in imported["measurements"]
        if item.get("source_measurement_id")
    )
    predecessor = imported_measurements[corrected["source_measurement_id"]]
    assert predecessor["superseded_by"] == corrected["id"]

    assert len(imported["records"]) == 1
    imported_record = imported["records"][0]
    assert imported_record["id"] != "record-1"
    assert imported_record["litter_id"] == target_litter_id
    assert imported_record["puppy_id"] == imported_puppy_id

    # The original source puppy remains untouched.
    source = storage.get_puppy(source_litter_id, source_puppy_id)
    assert source is not None
    assert {item["id"] for item in source["measurements"]} >= {"weight-old", "weight-new"}

    imported_audit = [
        item
        for item in storage.get_data()["audit_log"]
        if item.get("action") == "correct_measurement"
        and item.get("litter_id") == target_litter_id
        and item.get("puppy_id") == imported_puppy_id
    ]
    assert len(imported_audit) == 1
    assert imported_audit[0]["measurement_id"] in imported_measurements
    assert (
        imported_audit[0]["details"]["replacement_measurement_id"]
        in imported_measurements
    )


async def test_puppy_import_can_create_new_litter_from_source_metadata(
    storage,
    install_litter,
    make_measurement,
) -> None:
    litter_id, puppy_id = _install_consistent_source(
        storage,
        install_litter,
        make_measurement,
    )
    document = build_export_document(
        storage,
        scope="puppy",
        litter_id=litter_id,
        puppy_id=puppy_id,
    )

    plan = prepare_import(storage, document, mode="new_litter")
    await async_apply_import(storage, plan)

    new_litter_id = plan["summary"]["target_litter_id"]
    new_litter = storage.get_litter(new_litter_id)
    assert new_litter is not None
    assert new_litter_id != litter_id
    assert new_litter["name"] == "Luna 2026"
    assert new_litter["mother"] == "Luna"
    assert new_litter["father"] == "Dutch"
    assert len(new_litter["puppies"]) == 1


async def test_litter_import_as_new_remaps_nested_history(
    storage,
    install_litter,
    make_measurement,
) -> None:
    litter_id, _puppy_id = _install_consistent_source(
        storage,
        install_litter,
        make_measurement,
    )
    document = build_export_document(storage, scope="litter", litter_id=litter_id)

    plan = prepare_import(storage, document, mode="new_litter")
    await async_apply_import(storage, plan)

    imported_litter_id = plan["summary"]["target_litter_id"]
    imported_litter = storage.get_litter(imported_litter_id)
    assert imported_litter is not None
    assert imported_litter_id != litter_id

    imported_puppy_id, imported = next(iter(imported_litter["puppies"].items()))
    assert imported_puppy_id != "puppy-1"
    ids = {item["id"] for item in imported["measurements"]}
    assert not ids & {"birth-1", "weight-old", "weight-new"}
    corrected = next(item for item in imported["measurements"] if item.get("source_measurement_id"))
    assert corrected["source_measurement_id"] in ids


async def test_full_merge_as_new_keeps_current_data_and_remaps_source(
    storage,
    install_litter,
    make_measurement,
) -> None:
    source_litter_id, _ = _install_consistent_source(
        storage,
        install_litter,
        make_measurement,
    )
    document = build_export_document(storage, scope="full")

    storage._data["litters"] = {
        "existing": {
            "id": "existing",
            "name": "Existing",
            "birth_date": None,
            "mother": None,
            "father": None,
            "active": True,
            "created_at": "2026-08-30T00:00:00+00:00",
            "updated_at": "2026-08-30T00:00:00+00:00",
            "last_completed_session": None,
            "records": [],
            "puppies": {},
        }
    }

    plan = prepare_import(storage, document, mode="merge_as_new")
    await async_apply_import(storage, plan)

    litters = storage.get_litters()
    assert "existing" in litters
    assert source_litter_id not in litters
    assert len(litters) == 2


def test_legacy_export_version_two_is_recognized_as_litter_backup(
    storage,
    install_litter,
    make_measurement,
) -> None:
    litter_id, _ = _install_consistent_source(
        storage,
        install_litter,
        make_measurement,
    )
    legacy = {
        "export_version": 2,
        "exported_at": "2026-08-31T00:00:00+00:00",
        "integration": "puppy_tracker",
        "schema_version": 7,
        "litter": storage.get_litter(litter_id),
        "audit_log": [],
    }

    document = parse_export_json(json.dumps(legacy))
    assert document["scope"] == "litter"

    plan = prepare_import(storage, document, mode="new_litter")
    assert plan["summary"]["scope"] == "litter"


@pytest.mark.parametrize(
    ("payload", "code"),
    [
        ("not json", "invalid_backup_json"),
        (
            '{"export_version":3,"integration":"other","schema_version":7,"scope":"full","data":{}}',
            "invalid_backup",
        ),
        (
            '{"export_version":3,"integration":"puppy_tracker","schema_version":99,"scope":"full","data":{}}',
            "unsupported_schema_version",
        ),
    ],
)
def test_invalid_backup_is_rejected(payload: str, code: str) -> None:
    with pytest.raises(BackupValidationError) as err:
        parse_export_json(payload)
    assert err.value.code == code


async def test_import_refuses_stale_preview(
    storage,
    install_litter,
    make_measurement,
) -> None:
    litter_id, _ = _install_consistent_source(
        storage,
        install_litter,
        make_measurement,
    )
    document = build_export_document(storage, scope="litter", litter_id=litter_id)
    plan = prepare_import(storage, document, mode="new_litter")

    storage._data["updated_at"] = "2026-08-31T12:00:00+00:00"

    with pytest.raises(BackupValidationError) as err:
        await async_apply_import(storage, plan)
    assert err.value.code == "storage_changed"


async def test_failed_save_restores_previous_in_memory_data(
    storage,
    install_litter,
    make_measurement,
) -> None:
    litter_id, _ = _install_consistent_source(
        storage,
        install_litter,
        make_measurement,
    )
    document = build_export_document(storage, scope="litter", litter_id=litter_id)
    plan = prepare_import(storage, document, mode="new_litter")
    before = deepcopy(storage.get_data())

    storage.async_save = AsyncMock(side_effect=[RuntimeError("disk failure"), None])

    with pytest.raises(RuntimeError, match="disk failure"):
        await async_apply_import(storage, plan)

    assert storage.get_data() == before