"""Regression coverage for every historical Puppy Tracker storage schema."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
import json
from pathlib import Path
from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.mother_storage import MOTHER_SCHEMA_VERSION
from custom_components.puppy_tracker.mother_storage_integrity import (
    MotherScopeIntegrityStorage,
)


FIXTURE_PATH = Path(__file__).parent / "fixtures" / "storage_schema_versions.json"
HISTORICAL_SCHEMAS = tuple(range(1, MOTHER_SCHEMA_VERSION + 1))


def _load_fixtures() -> dict[int, dict]:
    with FIXTURE_PATH.open("r", encoding="utf-8") as handle:
        raw = json.load(handle)
    return {int(key): value for key, value in raw.items()}


def _instant(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _measurement_map(data: dict) -> dict[str, dict]:
    puppy = data["litters"]["litter-legacy"]["puppies"]["puppy-legacy"]
    return {item["id"]: item for item in puppy["measurements"]}


def _record_ids(records: list[dict]) -> set[str]:
    return {str(item["id"]) for item in records}


async def _migrate(hass, source: dict) -> tuple[MotherScopeIntegrityStorage, AsyncMock]:
    storage = MotherScopeIntegrityStorage(hass)
    storage._store.async_load = AsyncMock(return_value=deepcopy(source))
    save_mock = AsyncMock()
    storage._store.async_save = save_mock
    await storage.async_load()
    return storage, save_mock


def test_historical_fixture_catalog_covers_every_supported_schema() -> None:
    fixtures = _load_fixtures()
    assert tuple(sorted(fixtures)) == HISTORICAL_SCHEMAS
    assert "schema_version" not in fixtures[1]
    for schema in HISTORICAL_SCHEMAS[1:]:
        assert fixtures[schema]["schema_version"] == schema


@pytest.mark.asyncio
@pytest.mark.parametrize("source_schema", HISTORICAL_SCHEMAS)
async def test_every_historical_schema_migrates_to_current_without_identity_loss(
    hass,
    source_schema: int,
) -> None:
    source = _load_fixtures()[source_schema]
    source_measurements = {
        item["id"]: deepcopy(item)
        for item in source["litters"]["litter-legacy"]["puppies"]["puppy-legacy"][
            "measurements"
        ]
    }

    storage, save_mock = await _migrate(hass, source)
    data = storage.get_data()

    assert data["schema_version"] == MOTHER_SCHEMA_VERSION
    assert "litter-legacy" in data["litters"]
    litter = data["litters"]["litter-legacy"]
    assert litter["id"] == "litter-legacy"
    assert litter["active"] is False

    assert "puppy-legacy" in litter["puppies"]
    puppy = litter["puppies"]["puppy-legacy"]
    assert puppy["id"] == "puppy-legacy"
    assert puppy["active"] is False
    assert puppy["profile_note"] == "Legacy profile note"
    assert "notes" not in puppy

    migrated_measurements = _measurement_map(data)
    assert set(source_measurements).issubset(migrated_measurements)
    for measurement_id, before in source_measurements.items():
        after = migrated_measurements[measurement_id]
        assert float(after["weight"]) == float(before["weight"])
        assert _instant(after["timestamp"]) == _instant(before["timestamp"])

    assert puppy["birth_measurement_id"] == "birth-1"
    assert float(puppy["birth_weight"]) == 400.0
    assert _instant(puppy["birth_time"]) == _instant("2026-08-20T06:00:00+02:00")

    audit_ids = {str(item.get("id")) for item in data["audit_log"]}
    assert f"audit-schema-{source_schema}" in audit_ids

    mother_id = litter.get("mother_id")
    assert mother_id
    assert mother_id in data["mothers"]
    assert data["mothers"][mother_id]["name"] == "Luna"

    report = storage.get_integrity_report()
    assert report["unresolved_critical"] == 0
    assert save_mock.await_count >= 1


@pytest.mark.asyncio
@pytest.mark.parametrize("source_schema", (2, 3, 5, 6, 7, 8))
async def test_correction_chain_identity_survives_schema_migration(
    hass,
    source_schema: int,
) -> None:
    storage, _save_mock = await _migrate(hass, _load_fixtures()[source_schema])
    measurements = _measurement_map(storage.get_data())

    assert measurements["m1"]["superseded_by"] == "m1-corrected"
    assert measurements["m1-corrected"]["source_measurement_id"] == "m1"
    assert measurements["m1-corrected"]["deleted"] is False


@pytest.mark.asyncio
async def test_schema_4_repairs_known_deleted_terminal_correction_bug(hass) -> None:
    storage, _save_mock = await _migrate(hass, _load_fixtures()[4])
    measurements = _measurement_map(storage.get_data())

    # Schema 4 could retain A -> B after B was deleted. The historical migration
    # intentionally clears only that stale successor link while retaining both
    # measurement identities and the correction's source relationship.
    assert measurements["m1"]["superseded_by"] is None
    assert measurements["m1"]["deleted"] is False
    assert measurements["m1-corrected"]["deleted"] is True
    assert measurements["m1-corrected"]["source_measurement_id"] == "m1"


@pytest.mark.asyncio
@pytest.mark.parametrize("source_schema", (2, 3, 5, 6))
async def test_soft_deleted_measurement_state_survives_migration(
    hass,
    source_schema: int,
) -> None:
    storage, _save_mock = await _migrate(hass, _load_fixtures()[source_schema])
    deleted = _measurement_map(storage.get_data())["deleted-old"]
    assert deleted["deleted"] is True
    assert deleted["deleted_at"] is not None


@pytest.mark.asyncio
@pytest.mark.parametrize("source_schema", (7, 8))
async def test_dossier_identity_ownership_and_deleted_state_survive_migration(
    hass,
    source_schema: int,
) -> None:
    storage, _save_mock = await _migrate(hass, _load_fixtures()[source_schema])
    data = storage.get_data()
    litter = data["litters"]["litter-legacy"]
    puppy = litter["puppies"]["puppy-legacy"]

    assert _record_ids(litter["records"]) == {"record-litter-1"}
    assert _record_ids(puppy["records"]) == {
        "record-puppy-1",
        "record-puppy-deleted",
    }

    litter_record = litter["records"][0]
    assert litter_record["scope"] == "litter"
    assert litter_record["litter_id"] == "litter-legacy"
    assert litter_record["puppy_id"] is None

    puppy_records = {item["id"]: item for item in puppy["records"]}
    assert puppy_records["record-puppy-1"]["scope"] == "puppy"
    assert puppy_records["record-puppy-1"]["puppy_id"] == "puppy-legacy"
    assert puppy_records["record-puppy-deleted"]["deleted"] is True
    assert puppy_records["record-puppy-deleted"]["deleted_at"] is not None


@pytest.mark.asyncio
async def test_schema_8_preserves_persistent_mother_and_record_identity(hass) -> None:
    storage, _save_mock = await _migrate(hass, _load_fixtures()[8])
    data = storage.get_data()

    assert data["litters"]["litter-legacy"]["mother_id"] == "mother-luna"
    mother = data["mothers"]["mother-luna"]
    assert mother["id"] == "mother-luna"
    assert mother["profile_note"] == "Persistent mother"
    assert _record_ids(mother["records"]) == {"record-mother-1"}

    record = mother["records"][0]
    assert record["scope"] == "mother"
    assert record["mother_id"] == "mother-luna"
    assert record["litter_id"] == "litter-legacy"
    assert record["puppy_id"] is None


@pytest.mark.asyncio
async def test_schema_3_preserves_completed_weighing_session_summary(hass) -> None:
    storage, _save_mock = await _migrate(hass, _load_fixtures()[3])
    session = storage.get_data()["litters"]["litter-legacy"]["last_completed_session"]

    assert session["status"] == "completed"
    assert session["puppy_ids"] == ["puppy-legacy"]
    assert session["weights"] == {"puppy-legacy": 425.0}


@pytest.mark.asyncio
@pytest.mark.parametrize("source_schema", HISTORICAL_SCHEMAS)
async def test_migrated_storage_is_idempotent_on_second_load(
    hass,
    source_schema: int,
) -> None:
    first, _first_save = await _migrate(hass, _load_fixtures()[source_schema])
    migrated = first.get_data()

    second = MotherScopeIntegrityStorage(hass)
    second._store.async_load = AsyncMock(return_value=deepcopy(migrated))
    second_save = AsyncMock()
    second._store.async_save = second_save
    await second.async_load()

    assert second.get_data() == migrated
    second_save.assert_not_awaited()
