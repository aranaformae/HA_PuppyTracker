"""Completing a dossier due date creates a new, linked historical fact."""

import asyncio
from copy import deepcopy
from datetime import date
from unittest.mock import AsyncMock

import pytest
from homeassistant.setup import async_setup_component

from custom_components.puppy_tracker import api, mother_api
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
from custom_components.puppy_tracker.upcoming import upcoming_actions


@pytest.fixture
def followup_storage(hass, storage, install_litter):
    install_litter(litter_overrides={"mother_id": "mother-1"})
    instance = MotherScopeStorage(hass)
    instance._data = deepcopy(storage._data)
    instance._data["mothers"] = {"mother-1": {"id": "mother-1", "name": "Luna", "records": []}}
    instance.async_save = AsyncMock()
    return instance


def _owner(scope):
    return {"puppy_id": "puppy-1"} if scope == "puppy" else {"mother_id": "mother-1"} if scope == "mother" else {}


async def _source(storage, scope="puppy", record_type="deworming"):
    return await storage.async_add_record(
        "litter-1", **_owner(scope), record_type=record_type,
        occurred_at="2026-09-01T10:00:00+00:00", note="Original history",
        data={"product" if record_type == "deworming" else "vaccine": "Original product", "next_due_date": "2026-09-15"},
    )


async def _complete(storage, source_id, scope="puppy", record_type="deworming", **changes):
    payload = dict(
        record_type=record_type, occurred_at="2026-09-15T12:00:00+00:00",
        note="New execution", followup_record_id=source_id, followup_due_date="2026-09-15",
        data={"product" if record_type == "deworming" else "vaccine": "New product", "next_due_date": "2026-09-29"},
    )
    payload.update(changes)
    return await storage.async_add_record("litter-1", **_owner(scope), **payload)


@pytest.mark.parametrize("scope", ["puppy", "litter", "mother"])
@pytest.mark.parametrize("record_type", ["deworming", "vaccination"])
async def test_completion_keeps_source_and_only_new_due_date(followup_storage, scope, record_type):
    storage = followup_storage
    source_id = await _source(storage, scope, record_type)
    before = storage.get_record("litter-1", source_id, **_owner(scope))
    result_id = await _complete(storage, source_id, scope, record_type)
    assert result_id != source_id
    assert storage.get_record("litter-1", source_id, **_owner(scope)) == before
    records = storage.get_records("litter-1", **_owner(scope))
    assert len(records) == 2
    completed = storage.get_record("litter-1", result_id, **_owner(scope))
    assert completed["scope"] == scope
    assert completed["occurred_at"] == "2026-09-15T12:00:00+00:00"
    assert completed["data"]["followup_record_id"] == source_id
    actions = upcoming_actions(records, today=date(2026, 9, 15))
    assert [(item["source_record_id"], item["due_date"]) for item in actions] == [(result_id, "2026-09-29")]


async def test_no_next_date_and_delete_restore_completion(followup_storage):
    storage = followup_storage
    source_id = await _source(storage)
    result_id = await _complete(storage, source_id, data={"product": "Different product"})
    actions = lambda: upcoming_actions(storage.get_records("litter-1", "puppy-1"), today=date(2026, 9, 15))
    assert actions() == []
    await storage.async_delete_record("litter-1", result_id, "puppy-1")
    assert [item["source_record_id"] for item in actions()] == [source_id]
    await storage.async_restore_record("litter-1", result_id, "puppy-1")
    assert actions() == []


@pytest.mark.parametrize("changes, message", [
    ({"followup_due_date": "2026-09-16"}, "date has changed"),
    ({"followup_due_date": None}, "valid follow-up date"),
    ({"followup_record_id": "unknown"}, "no longer exists"),
    ({"record_type": "vaccination"}, "same vaccination or deworming type"),
    ({"data": {}}, "product used"),
    ({"data": {"product": "Example", "next_due_date": "not-a-date"}}, "valid next due date"),
])
async def test_invalid_or_stale_completion_does_not_change_data(followup_storage, changes, message):
    storage = followup_storage
    source_id = await _source(storage)
    before = storage.get_data()
    with pytest.raises(ValueError, match=message):
        await _complete(storage, source_id, **changes)
    assert storage.get_data() == before


@pytest.mark.parametrize("scope", ["puppy", "litter", "mother"])
async def test_concurrent_completion_cannot_create_duplicates(followup_storage, scope):
    source_id = await _source(followup_storage, scope)
    results = await asyncio.gather(
        _complete(followup_storage, source_id, scope),
        _complete(followup_storage, source_id, scope), return_exceptions=True,
    )
    assert sum(isinstance(item, str) for item in results) == 1
    assert sum(isinstance(item, ValueError) for item in results) == 1
    assert len(followup_storage.get_records("litter-1", **_owner(scope))) == 2


@pytest.mark.parametrize("scope", ["puppy", "litter", "mother"])
async def test_failed_completion_write_rolls_back_and_can_retry(followup_storage, scope):
    storage = followup_storage
    source_id = await _source(storage, scope)
    before = storage.get_data()
    storage.async_save.side_effect = OSError("Disk unavailable")
    with pytest.raises(OSError):
        await _complete(storage, source_id, scope)
    assert storage.get_data() == before
    storage.async_save.side_effect = None
    await _complete(storage, source_id, scope)
    assert len(storage.get_records("litter-1", **_owner(scope))) == 2


async def test_other_owner_or_changed_due_date_cannot_suppress_source(followup_storage):
    storage = followup_storage
    source_id = await _source(storage)
    with pytest.raises(ValueError, match="no longer exists"):
        await _complete(storage, source_id, "litter")
    result_id = await _complete(storage, source_id)
    source = storage.get_record("litter-1", source_id, "puppy-1")
    source["data"]["next_due_date"] = "2026-09-20"
    await storage.async_update_record("litter-1", source_id, puppy_id="puppy-1", record_type="deworming", data=source["data"])
    actions = upcoming_actions(storage.get_records("litter-1", "puppy-1"), today=date(2026, 9, 15))
    assert {item["source_record_id"] for item in actions} == {source_id, result_id}


async def test_mother_followup_cannot_be_completed_in_another_litter(followup_storage):
    storage = followup_storage
    source_id = await _source(storage, "mother")
    second = deepcopy(storage._data["litters"]["litter-1"])
    second.update(id="litter-2", puppies={}, records=[])
    storage._data["litters"]["litter-2"] = second
    before = storage.get_data()
    with pytest.raises(ValueError, match="another litter"):
        await storage.async_add_record("litter-2", mother_id="mother-1", record_type="deworming",
            followup_record_id=source_id, followup_due_date="2026-09-15", data={"product": "New product"})
    assert storage.get_data() == before


@pytest.mark.parametrize("language", ["nl", "en"])
def test_pdf_displays_execution_not_internal_linking_ids(language):
    from custom_components.puppy_tracker.pdf_export import _record_data_text

    text = _record_data_text({"data": {"product": "Example", "followup_record_id": "private-link", "followup_due_date": "2026-09-15"}}, language)
    assert "Example" in text
    assert "private-link" not in text
    assert "2026-09-15" not in text


@pytest.mark.parametrize("scope", ["puppy", "litter", "mother"])
async def test_real_websocket_add_accepts_completion_and_rejects_replay(hass, followup_storage, hass_ws_client, monkeypatch, scope):
    storage = followup_storage
    source_id = await _source(storage, scope)
    await async_setup_component(hass, "websocket_api", {})
    monkeypatch.setattr(api, "get_runtime_storage", lambda _hass: storage)
    monkeypatch.setattr(mother_api, "get_runtime_storage", lambda _hass: storage)
    api.async_setup_api(hass)
    mother_api.async_setup_mother_api(hass)
    client = await hass_ws_client(hass)
    command = {"type": f"puppy_tracker/{'mother/' if scope == 'mother' else ''}record/add", "litter_id": "litter-1",
               "record_type": "deworming", "followup_record_id": source_id, "followup_due_date": "2026-09-15", "data": {"product": "New product"}}
    if scope == "puppy":
        command["puppy_id"] = "puppy-1"
    await client.send_json_auto_id(command)
    result = await client.receive_json()
    assert result["success"], result
    assert result["result"]["record"]["scope"] == scope
    assert result["result"]["record"]["data"]["followup_record_id"] == source_id
    await client.send_json_auto_id(command)
    result = await client.receive_json()
    assert not result["success"]
    assert result["error"]["code"] == "invalid_record"
    assert len(storage.get_records("litter-1", **_owner(scope))) == 2
