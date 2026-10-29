from __future__ import annotations

from pathlib import Path
from unittest.mock import AsyncMock

import pytest
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.care_program_api import _program_has_active_results, async_setup_care_program_api
from custom_components.puppy_tracker.care_programs import AgeBasedCareProgramStore, normalize_care_program
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("enabled,active", [(None, True), (False, True), (True, False), (True, True)])
async def test_occurrence_context_distinguishes_missing_disabled_and_empty_programs(
    hass, storage, install_litter, hass_ws_client, enabled, active,
):
    litter_id, puppy_id = install_litter(puppy_overrides={"active": active})
    store = AgeBasedCareProgramStore(hass)
    store._store.async_save = AsyncMock()
    if enabled is not None:
        program = normalize_care_program({"litter_id": litter_id, "title": "ENS", "record_type": "test", "schedule_type": "once", "start_age_days": 3, "enabled": enabled}, program_id="ens")
        store._data = {"programs": {"ens": program}}
        storage._data["litters"][litter_id]["puppies"][puppy_id]["records"] = [{
            "id": "result", "type": "test", "occurred_at": "2026-08-31T12:00:00Z", "deleted": False,
            "data": {"care_occurrence_id": f"ens:{puppy_id}:3", "care_status": "completed"},
        }]
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = PuppyTrackerRuntimeData(storage=storage, care_programs=store)
    entry.add_to_hass(hass)
    async_setup_care_program_api(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": f"{DOMAIN}/care_occurrences", "litter_id": litter_id})
    response = await client.receive_json()
    assert response["success"] is True
    result = response["result"]
    assert result["context"] == {"program_count": int(enabled is not None), "enabled_program_count": int(enabled is True), "active_puppy_count": int(active), "today": dt_util.now().date().isoformat()}
    assert result["skipped"] == []
    if enabled and active:
        assert len(result["occurrences"]) == 1
        assert result["occurrences"][0]["status"] == "completed"
    else:
        assert result["occurrences"] == []


async def test_course_websocket_records_one_actual_administration_and_rejects_duplicate(
    hass, storage, install_litter, hass_ws_client,
) -> None:
    litter_id, puppy_id = install_litter()
    store = AgeBasedCareProgramStore(hass)
    store._store.async_save = AsyncMock()
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = PuppyTrackerRuntimeData(storage=storage, care_programs=store)
    entry.add_to_hass(hass)
    async_setup_care_program_api(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({
        "type": f"{DOMAIN}/care_program/create", "litter_id": litter_id,
        "title": "Medicatie", "record_type": "medication", "schedule_type": "course",
        "target_puppy_ids": [puppy_id], "start_date": "2026-10-28",
        "end_date": "2026-10-28", "times_of_day": ["08:00", "18:00"],
        "timezone": "Europe/Amsterdam", "treatment_product": "Product A",
    })
    created = await client.receive_json()
    assert created["success"] is True
    program_id = created["result"]["program_id"]
    await client.send_json_auto_id({
        "type": f"{DOMAIN}/care_program/conflicts",
        "program": {
            "litter_id": litter_id, "title": "Tweede medicatiekuur",
            "record_type": "medication", "schedule_type": "course",
            "target_puppy_ids": [puppy_id], "start_date": "2026-10-28",
            "end_date": "2026-10-28", "times_of_day": ["08:00"],
            "timezone": "Europe/Amsterdam", "treatment_product": "Product B",
        },
    })
    reviewed = await client.receive_json()
    assert reviewed["success"] is True
    assert any(item["kind"] == "care_program" for item in reviewed["result"]["conflicts"])
    await client.send_json_auto_id({"type": f"{DOMAIN}/care_occurrences", "litter_id": litter_id})
    listed = await client.receive_json()
    assert listed["success"] is True
    occurrences = listed["result"]["occurrences"]
    assert len(occurrences) == 2
    first = occurrences[0]
    message = {
        "type": f"{DOMAIN}/care_occurrence/record", "program_id": program_id,
        "puppy_id": puppy_id, "occurrence_id": first["id"], "status": "completed",
        "data": {"medication": "Product B", "dose": "0.5", "unit": "ml"},
    }
    await client.send_json_auto_id(message)
    assert (await client.receive_json())["success"] is True
    await client.send_json_auto_id(message)
    duplicate = await client.receive_json()
    assert duplicate["success"] is False
    records = storage.get_records(litter_id, puppy_id)
    assert len([item for item in records if item.get("data", {}).get("care_occurrence_id") == first["id"]]) == 1
    await client.send_json_auto_id({"type": f"{DOMAIN}/care_programs", "litter_id": litter_id})
    listed_programs = await client.receive_json()
    progress = listed_programs["result"]["programs"][0]["progress"]
    assert progress[0]["completed"] == 1
    assert progress[0]["pending"] == 1
    assert progress[0]["total"] == 2


class _ResultStorage:
    def __init__(self, records_by_puppy: dict[str, list[dict]]) -> None:
        self.records_by_puppy = records_by_puppy

    def get_litter(self, litter_id: str):
        if litter_id != "litter-1":
            return None
        return {
            "id": litter_id,
            "puppies": {
                "pup-1": {"id": "pup-1", "active": True},
                "pup-2": {"id": "pup-2", "active": False},
            },
        }

    def get_records(self, litter_id: str, puppy_id: str, *, newest_first: bool = False):
        assert litter_id == "litter-1"
        return list(self.records_by_puppy.get(puppy_id, []))


def test_care_program_store_is_loaded_into_runtime_before_api_registration() -> None:
    init_source = (ROOT / "custom_components" / "puppy_tracker" / "__init__.py").read_text(encoding="utf-8")
    runtime_source = (ROOT / "custom_components" / "puppy_tracker" / "runtime.py").read_text(encoding="utf-8")

    assert "care_programs: AgeBasedCareProgramStore | None = None" in runtime_source
    assert "care_programs = AgeBasedCareProgramStore(hass)" in init_source
    assert "await care_programs.async_load()" in init_source
    assert "care_programs=care_programs" in init_source
    assert init_source.index("await care_programs.async_load()") < init_source.index("async_setup_care_program_api(hass)")


def test_care_program_api_exposes_program_crud_occurrences_and_result_recording() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "care_program_api.py").read_text(encoding="utf-8")

    assert 'f"{DOMAIN}/care_programs"' in source
    assert 'f"{DOMAIN}/care_occurrences"' in source
    assert 'f"{DOMAIN}/care_occurrence/record"' in source
    assert 'f"{DOMAIN}/care_program/create"' in source
    assert 'f"{DOMAIN}/care_program/update"' in source
    assert 'f"{DOMAIN}/care_program/delete"' in source
    assert "derive_litter_care_occurrences" in source
    assert "async_record_care_result" in source


def test_care_result_api_rederives_occurrence_and_rejects_duplicates() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "care_program_api.py").read_text(encoding="utf-8")

    assert "def _derive_occurrence(" in source
    assert "derive_litter_care_occurrences(program, [puppy])" in source
    assert "def _existing_occurrence_result(" in source
    assert 'data.get("care_occurrence_id")' in source
    assert "already has an active result" in source
    assert "occurred_at=msg.get(\"occurred_at\")" in source


def test_occurrence_api_reports_missing_birth_times_without_guessing() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "care_program_api.py").read_text(encoding="utf-8")

    assert '"skipped": skipped' in source
    assert '"puppy_name":' in source
    assert '"reason_code": _skip_reason_code(reason)' in source
    assert 'return "missing_birth_time"' in source
    assert '"reason": reason' in source
    assert "except ValueError as err" in source


def test_active_result_locks_program_even_for_inactive_puppy() -> None:
    storage = _ResultStorage(
        {
            "pup-2": [
                {
                    "id": "record-1",
                    "deleted": False,
                    "data": {"care_program_id": "program-1"},
                }
            ]
        }
    )
    assert _program_has_active_results(
        storage,
        {"id": "program-1", "litter_id": "litter-1"},
    )


def test_deleted_or_other_program_results_do_not_lock_program() -> None:
    storage = _ResultStorage(
        {
            "pup-1": [
                {
                    "id": "deleted",
                    "deleted": True,
                    "data": {"care_program_id": "program-1"},
                },
                {
                    "id": "other",
                    "deleted": False,
                    "data": {"care_program_id": "program-2"},
                },
            ]
        }
    )
    assert not _program_has_active_results(
        storage,
        {"id": "program-1", "litter_id": "litter-1"},
    )


def test_care_program_update_locks_identity_after_results() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "care_program_api.py").read_text(encoding="utf-8")

    assert "care_program_identity_changed(current, normalized_candidate)" in source
    assert "_program_has_active_results(storage, current)" in source
    assert '"care_program_locked"' in source
    assert "create a new care program instead" in source


def test_care_program_api_preserves_existing_owner_and_reminder_contracts() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "care_program_api.py").read_text(encoding="utf-8")

    assert "owner_scope" not in source
    assert "last_completed_at" not in source
    assert "async_match_record" not in source
    # Conflict review may read reminders, but care-program actions must not
    # create, update or mark a recurring reminder completed.
    assert "reminder_store.async_" not in source
