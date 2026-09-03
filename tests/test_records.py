"""Regression tests for Puppy Tracker dossier records."""

from __future__ import annotations

from copy import deepcopy

import pytest

from custom_components.puppy_tracker.integrity import inspect_and_repair_data
from custom_components.puppy_tracker.records import (
    RECORD_SCOPE_LITTER,
    RECORD_SCOPE_PUPPY,
    create_record,
    sorted_records,
    validate_record_type,
)


def _valid_record(
    record_id: str,
    *,
    litter_id: str = "litter-1",
    puppy_id: str | None = "puppy-1",
    occurred_at: str = "2026-08-30T10:00:00+00:00",
    created_at: str = "2026-08-30T10:00:01+00:00",
    record_type: str = "note",
) -> dict:
    """Return a complete dossier record for focused integrity tests."""
    return {
        "id": record_id,
        "type": record_type,
        "scope": RECORD_SCOPE_PUPPY if puppy_id is not None else RECORD_SCOPE_LITTER,
        "litter_id": litter_id,
        "puppy_id": puppy_id,
        "occurred_at": occurred_at,
        "created_at": created_at,
        "updated_at": created_at,
        "deleted": False,
        "deleted_at": None,
        "title": None,
        "note": "Testnotitie",
        "data": {},
    }


def _integrity_data(*, litter_records=None, puppy_records=None) -> dict:
    """Build a minimal valid owner tree for dossier integrity checks."""
    return {
        "litters": {
            "litter-1": {
                "id": "litter-1",
                "records": deepcopy(litter_records or []),
                "puppies": {
                    "puppy-1": {
                        "id": "puppy-1",
                        "profile_note": None,
                        "records": deepcopy(puppy_records or []),
                        "measurements": [],
                        "birth_weight": None,
                        "birth_time": None,
                        "birth_measurement_id": None,
                    }
                },
            }
        }
    }


def test_record_type_is_future_extensible_but_strict() -> None:
    """Future snake_case modules work without accepting arbitrary identifiers."""
    assert validate_record_type("vaccination") == "vaccination"
    assert validate_record_type("microchip_registration") == "microchip_registration"

    for invalid in ("", "Vaccination", "vet-visit", "has space", "_private"):
        with pytest.raises(ValueError):
            validate_record_type(invalid)


def test_create_record_uses_correct_owner_scope_and_copies_payload() -> None:
    payload = {"batch": "ABC123", "nested": {"value": 1}}
    record = create_record(
        litter_id="litter-1",
        puppy_id="puppy-1",
        record_type="vaccination",
        occurred_at="2026-08-30T12:30:47+02:00",
        title="Puppy DP",
        note=" Geen bijzonderheden ",
        data=payload,
        now="2026-08-30T10:35:00+00:00",
    )

    payload["nested"]["value"] = 99

    assert record["scope"] == RECORD_SCOPE_PUPPY
    assert record["litter_id"] == "litter-1"
    assert record["puppy_id"] == "puppy-1"
    assert record["occurred_at"] == "2026-08-30T10:30:47+00:00"
    assert record["title"] == "Puppy DP"
    assert record["note"] == "Geen bijzonderheden"
    assert record["data"]["nested"]["value"] == 1


def test_record_sorting_uses_occurrence_then_creation_time() -> None:
    same_time = "2026-08-30T10:00:00+00:00"
    records = [
        _valid_record("b", occurred_at=same_time, created_at="2026-08-30T10:00:03+00:00"),
        _valid_record("a", occurred_at=same_time, created_at="2026-08-30T10:00:02+00:00"),
        _valid_record(
            "earlier",
            occurred_at="2026-08-30T11:59:59+02:00",
            created_at="2026-08-30T10:00:04+00:00",
        ),
    ]

    # 11:59:59+02:00 is 09:59:59 UTC and must sort before 10:00 UTC.
    assert [item["id"] for item in sorted_records(records)] == ["earlier", "a", "b"]


@pytest.mark.asyncio
async def test_puppy_record_crud_is_non_destructive(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter()

    record_id = await storage.async_add_record(
        litter_id,
        puppy_id=puppy_id,
        record_type="note",
        occurred_at="2026-08-30T10:30:47+00:00",
        title="Ochtend",
        note="Drinkt goed",
        data={"category": "general"},
    )
    created = storage.get_record(litter_id, record_id, puppy_id)

    assert created is not None
    assert created["scope"] == RECORD_SCOPE_PUPPY
    assert created["puppy_id"] == puppy_id
    assert created["deleted"] is False
    original_created_at = created["created_at"]

    await storage.async_update_record(
        litter_id,
        record_id,
        puppy_id=puppy_id,
        record_type="note",
        occurred_at=None,
        title="Ochtendcontrole",
        note="Drinkt erg goed",
        data={"category": "feeding"},
    )
    updated = storage.get_record(litter_id, record_id, puppy_id)

    assert updated["id"] == record_id
    assert updated["created_at"] == original_created_at
    assert updated["occurred_at"] == "2026-08-30T10:30:47+00:00"
    assert updated["title"] == "Ochtendcontrole"
    assert updated["note"] == "Drinkt erg goed"
    assert updated["data"] == {"category": "feeding"}

    await storage.async_delete_record(litter_id, record_id, puppy_id)
    assert storage.get_record(litter_id, record_id, puppy_id)["deleted"] is True
    assert storage.get_records(litter_id, puppy_id) == []
    assert [item["id"] for item in storage.get_records(litter_id, puppy_id, include_deleted=True)] == [record_id]

    await storage.async_restore_record(litter_id, record_id, puppy_id)
    restored = storage.get_record(litter_id, record_id, puppy_id)
    assert restored["deleted"] is False
    assert restored["deleted_at"] is None
    assert [item["id"] for item in storage.get_records(litter_id, puppy_id)] == [record_id]

    actions = [item.get("action") for item in storage._data["audit_log"]]
    assert actions[-4:] == ["add_record", "update_record", "delete_record", "restore_record"]
    assert storage._data["audit_log"][-1]["record_id"] == record_id


@pytest.mark.asyncio
async def test_litter_and_puppy_records_remain_separate(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter()

    litter_record_id = await storage.async_add_record(
        litter_id,
        record_type="vet_visit",
        note="Nestcontrole",
    )
    puppy_record_id = await storage.async_add_record(
        litter_id,
        puppy_id=puppy_id,
        record_type="vaccination",
        note="Pupvaccinatie",
    )

    litter_records = storage.get_records(litter_id)
    puppy_records = storage.get_records(litter_id, puppy_id)

    assert [item["id"] for item in litter_records] == [litter_record_id]
    assert litter_records[0]["scope"] == RECORD_SCOPE_LITTER
    assert litter_records[0]["puppy_id"] is None
    assert [item["id"] for item in puppy_records] == [puppy_record_id]
    assert puppy_records[0]["scope"] == RECORD_SCOPE_PUPPY
    assert puppy_records[0]["puppy_id"] == puppy_id


@pytest.mark.asyncio
async def test_change_record_owner_moves_record_atomically_and_audits(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter()
    record_id = await storage.async_add_record(
        litter_id,
        record_type="temperature",
        note="38.4",
    )

    moved = await storage.async_change_record_owner(
        litter_id,
        record_id,
        target_puppy_id=puppy_id,
    )

    assert moved["id"] == record_id
    assert moved["puppy_id"] == puppy_id
    assert storage.get_record(litter_id, record_id) is None
    assert storage.get_record(litter_id, record_id, puppy_id)["note"] == "38.4"
    assert storage._data["audit_log"][-1]["action"] == "change_record_owner"

    await storage.async_change_record_owner(
        litter_id,
        record_id,
        source_puppy_id=puppy_id,
        target_puppy_id=None,
    )
    assert storage.get_record(litter_id, record_id, puppy_id) is None
    assert storage.get_record(litter_id, record_id)["puppy_id"] is None

    with pytest.raises(ValueError, match="already belongs"):
        await storage.async_change_record_owner(litter_id, record_id, target_puppy_id=None)


def test_legacy_notes_migrate_to_profile_note_and_record_containers(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter(
        puppy_overrides={"notes": "Rustige pup", "profile_note": None},
    )
    puppy = storage._data["litters"][litter_id]["puppies"][puppy_id]
    del puppy["profile_note"]
    puppy.pop("records", None)
    storage._data["litters"][litter_id].pop("records", None)

    changed = storage._migrate_records()
    migrated = storage._data["litters"][litter_id]["puppies"][puppy_id]

    assert changed is True
    assert migrated["profile_note"] == "Rustige pup"
    assert "notes" not in migrated
    assert migrated["records"] == []
    assert storage._data["litters"][litter_id]["records"] == []


def test_existing_profile_note_wins_over_legacy_notes(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter(
        puppy_overrides={
            "profile_note": "Nieuwe profieltekst",
            "notes": "Oude tekst",
        },
    )

    changed = storage._migrate_records()
    puppy = storage._data["litters"][litter_id]["puppies"][puppy_id]

    assert changed is True
    assert puppy["profile_note"] == "Nieuwe profieltekst"
    assert "notes" not in puppy


def test_integrity_repairs_record_ownership_without_changing_content() -> None:
    record = _valid_record("record-1")
    record.update({"scope": "litter", "litter_id": "wrong", "puppy_id": "wrong"})
    data = _integrity_data(puppy_records=[record])

    changed, report = inspect_and_repair_data(data, repair=True)
    repaired = data["litters"]["litter-1"]["puppies"]["puppy-1"]["records"][0]

    assert changed is True
    assert repaired["scope"] == RECORD_SCOPE_PUPPY
    assert repaired["litter_id"] == "litter-1"
    assert repaired["puppy_id"] == "puppy-1"
    assert repaired["note"] == "Testnotitie"
    assert report["repair_counts"]["record_scope_mismatch"] == 1
    assert report["repair_counts"]["record_litter_id_mismatch"] == 1
    assert report["repair_counts"]["record_puppy_id_mismatch"] == 1
    assert report["unresolved_critical"] == 0


def test_integrity_does_not_guess_duplicate_or_invalid_records() -> None:
    first = _valid_record("same")
    second = _valid_record("same", record_type="NOT VALID")
    data = _integrity_data(puppy_records=[first, second])

    changed, report = inspect_and_repair_data(data, repair=True)

    assert changed is False
    assert report["healthy"] is False
    assert report["issue_counts"]["duplicate_record_id"] == 1
    assert report["issue_counts"]["invalid_record_type"] == 1
    assert report["unresolved_critical"] >= 2


def test_integrity_repairs_stale_deleted_at_on_active_record() -> None:
    record = _valid_record("record-1")
    record["deleted_at"] = "2026-08-30T10:05:00+00:00"
    data = _integrity_data(puppy_records=[record])

    changed, report = inspect_and_repair_data(data, repair=True)

    repaired = data["litters"]["litter-1"]["puppies"]["puppy-1"]["records"][0]
    assert changed is True
    assert repaired["deleted_at"] is None
    assert report["repair_counts"]["active_record_has_deleted_at"] == 1
