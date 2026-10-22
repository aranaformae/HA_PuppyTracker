"""Durable station checkpoints, explicit recovery and atomic measurement saves."""

import asyncio
from inspect import unwrap
from copy import deepcopy
from unittest.mock import AsyncMock, Mock

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.button import PuppyStartSessionButton, PuppyResetSessionButton
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData
from custom_components.puppy_tracker.storage import PuppyTrackerStorage
from custom_components.puppy_tracker.backup import build_export_document, prepare_import
from custom_components.puppy_tracker import api
from custom_components.puppy_tracker.session import (
    async_record_station_weight, async_resolve_session, recover_session,
)


@pytest.fixture
async def station(hass, storage, install_litter):
    litter_id, first = install_litter()
    second = await storage.async_add_puppy(litter_id, "Blauw", collar_color="blauw")
    runtime = PuppyTrackerRuntimeData(storage=storage, selected_litter_id=litter_id)
    entry = MockConfigEntry(domain=DOMAIN)
    entry.runtime_data = runtime
    start = PuppyStartSessionButton(hass, entry)
    start.hass = hass
    reset = PuppyResetSessionButton(hass, entry)
    reset.hass = hass
    await start.async_press()
    return runtime, start, reset, litter_id, first, second


async def test_restart_requires_explicit_resume_and_never_replays_input(station):
    runtime, _, _, litter_id, first, second = station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    recovered = PuppyTrackerRuntimeData(storage=runtime.storage, weighing_session=recover_session(runtime.storage))
    assert recovered.weighing_session["status"] == "interrupted"
    assert recovered.weighing_session["weighed_puppy_ids"] == [first]
    assert recovered.weighing_session["measurement_ids"][first] == [mid]
    assert recovered.weight_input == 0
    with pytest.raises(ValueError, match="Hervat"):
        await async_record_station_weight(recovered, litter_id=litter_id, puppy_id=second, weight=460)
    session = recovered.weighing_session
    await async_resolve_session(recovered, resume=True, session_id=session["id"], revision=session["revision"])
    assert recovered.selected_puppy_id == second
    assert recovered.weighing_session["status"] == "active"
    await async_record_station_weight(recovered, litter_id=litter_id, puppy_id=second, weight=460)
    assert recovered.weighing_session["status"] == "completed"
    assert runtime.storage.get_litter(litter_id)["last_completed_session"]["weighed_puppies"] == 2
    assert len(runtime.storage.get_puppy(litter_id, first)["measurements"]) == 1


async def test_discard_keeps_saved_history_and_stale_resume_cannot_touch_new_session(station):
    runtime, start, reset, litter_id, first, _ = station
    await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    runtime.weighing_session = recover_session(runtime.storage)
    old = deepcopy(runtime.weighing_session)
    await async_resolve_session(runtime, resume=False, session_id=old["id"], revision=old["revision"])
    assert runtime.weighing_session["status"] == "idle"
    assert runtime.storage.get_puppy(litter_id, first)["measurements"]
    await start.async_press()
    new = deepcopy(runtime.weighing_session)
    with pytest.raises(ValueError, match="gewijzigd"):
        await async_resolve_session(runtime, resume=True, session_id=old["id"], revision=old["revision"])
    assert runtime.weighing_session == new
    await reset.async_press()
    assert runtime.storage.get_data()["weighing_session"] is None


async def test_failed_weight_rolls_back_measurement_progress_audit_and_selection(station):
    runtime, _, _, litter_id, first, _ = station
    before = runtime.storage.get_data()
    session = deepcopy(runtime.weighing_session)
    selected = runtime.selected_puppy_id
    runtime.storage.async_save = AsyncMock(side_effect=OSError("disk full"))
    with pytest.raises(OSError):
        await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    assert runtime.storage.get_data() == before
    assert runtime.weighing_session == session
    assert runtime.selected_puppy_id == selected


async def test_completed_checkpoint_and_summary_share_the_last_measurement_commit(station):
    runtime, _, _, litter_id, first, second = station
    await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    observed = []
    runtime.storage.async_save = AsyncMock(side_effect=lambda: observed.append(runtime.storage.get_data()))
    await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=second, weight=460)
    assert len(observed) == 1
    assert observed[0]["weighing_session"]["status"] == "completed"
    assert observed[0]["litters"][litter_id]["last_completed_session"]["weighed_puppies"] == 2
    assert observed[0]["litters"][litter_id]["puppies"][second]["measurements"]


async def test_recovery_rechecks_deleted_measurements_and_archived_puppies(station):
    runtime, _, _, litter_id, first, second = station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    await runtime.storage.async_delete_weight(litter_id, first, mid)
    runtime.storage._data["litters"][litter_id]["puppies"][second]["active"] = False
    session = recover_session(runtime.storage)
    assert session["puppy_ids"] == [first]
    assert session["weighed_puppy_ids"] == []


async def test_failed_resume_or_reset_keeps_the_checkpoint(station):
    runtime, _, reset, _, _, _ = station
    runtime.weighing_session = recover_session(runtime.storage)
    before = runtime.storage.get_data()
    session = deepcopy(runtime.weighing_session)
    runtime.storage.async_save = AsyncMock(side_effect=OSError("disk full"))
    with pytest.raises(OSError):
        await async_resolve_session(runtime, resume=True, session_id=session["id"], revision=session["revision"])
    assert runtime.weighing_session == session
    assert runtime.storage.get_data() == before
    with pytest.raises(OSError):
        await reset.async_press()
    assert runtime.storage.get_data() == before


@pytest.mark.parametrize("checkpoint", [None, [], {"version": 99}, {"version": 1, "id": []}])
async def test_missing_or_unrecognized_checkpoint_never_starts_a_session(storage, checkpoint):
    storage._data["weighing_session"] = checkpoint
    assert recover_session(storage)["status"] == "idle"


async def test_two_waiting_station_saves_do_not_both_apply_to_one_revision(station):
    runtime, _, _, litter_id, first, _ = station
    await runtime.weighing_lock.acquire()
    tasks = [asyncio.create_task(async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)) for _ in range(2)]
    await asyncio.sleep(0)
    runtime.weighing_lock.release()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    assert sum(isinstance(value, ValueError) for value in results) == 1
    assert len(runtime.storage.get_puppy(litter_id, first)["measurements"]) == 1


async def test_new_storage_instance_loads_the_checkpoint_without_a_second_measurement(hass, station):
    runtime, _, _, litter_id, first, _ = station
    await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    fresh = PuppyTrackerStorage(hass)
    fresh._store.async_load = AsyncMock(return_value=runtime.storage.get_data())
    fresh._store.async_save = AsyncMock()
    await fresh.async_load()
    session = recover_session(fresh)
    assert session["status"] == "interrupted"
    assert session["weighed_puppy_ids"] == [first]
    assert len([m for m in fresh.get_puppy(litter_id, first)["measurements"] if m["kind"] == "weight"]) == 1


async def test_portable_backup_neither_exports_nor_restores_a_live_checkpoint(station):
    runtime, _, _, _, _, _ = station
    document = build_export_document(runtime.storage, scope="full", care_reminder_settings={
        "lead_days": 5, "categories": {"vaccination": True, "deworming": True},
    }, scheduler_data={"version": 1, "care_programs": {"programs": {}}, "recurring_reminders": {"reminders": {}}})
    assert "weighing_session" not in document["data"]
    document["data"]["weighing_session"] = deepcopy(runtime.weighing_session)
    plan = prepare_import(runtime.storage, document, mode="replace_all")
    assert "weighing_session" not in plan["candidate"]


async def test_recovery_websocket_routes_exact_checkpoint_and_reports_stale_requests(hass, station, monkeypatch):
    runtime, _, _, _, _, _ = station
    runtime.weighing_session = recover_session(runtime.storage)
    session = deepcopy(runtime.weighing_session)
    monkeypatch.setattr(api, "get_runtime_data", lambda _: runtime)
    connection = Mock()
    msg = {"id": 1, "session_id": session["id"], "revision": session["revision"], "action": "resume"}
    await unwrap(api.websocket_resolve_weighing_session)(hass, connection, msg)
    connection.send_result.assert_called_once_with(1, {"ok": True})
    assert runtime.weighing_session["status"] == "active"
    connection.reset_mock()
    await unwrap(api.websocket_resolve_weighing_session)(hass, connection, {**msg, "action": "discard"})
    connection.send_error.assert_called_once()
    connection.send_result.assert_not_called()
    assert runtime.weighing_session["status"] == "active"
