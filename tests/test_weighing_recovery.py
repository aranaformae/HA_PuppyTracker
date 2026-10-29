"""Durable station checkpoints, explicit recovery and atomic measurement saves."""

import asyncio
from inspect import unwrap
from copy import deepcopy
from unittest.mock import AsyncMock, Mock

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.button import PuppyStartSessionButton, PuppyResetSessionButton
from custom_components.puppy_tracker.const import DOMAIN, EVENT_WEIGHT_RECORDED, EVENT_WEIGHING_SESSION_COMPLETED
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData
from custom_components.puppy_tracker.storage import PuppyTrackerStorage
from custom_components.puppy_tracker.backup import build_export_document, prepare_import
from custom_components.puppy_tracker import api
from custom_components.puppy_tracker.session import (
    async_record_station_weight, async_resolve_session, async_undo_station_weight, recover_session,
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
    emitted = []
    runtime.storage.hass.bus.async_listen(EVENT_WEIGHT_RECORDED, lambda event: emitted.append(event))
    before = runtime.storage.get_data()
    session = deepcopy(runtime.weighing_session)
    selected = runtime.selected_puppy_id
    runtime.storage.async_save = AsyncMock(side_effect=OSError("disk full"))
    with pytest.raises(OSError):
        await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    await runtime.storage.hass.async_block_till_done()
    assert runtime.storage.get_data() == before
    assert runtime.weighing_session == session
    assert runtime.selected_puppy_id == selected
    assert emitted == []


async def test_public_weight_and_session_events_fire_once_after_success(station):
    runtime, _, _, litter_id, first, second = station
    events = []
    runtime.storage.hass.bus.async_listen(EVENT_WEIGHT_RECORDED, lambda event: events.append(event))
    runtime.storage.hass.bus.async_listen(EVENT_WEIGHING_SESSION_COMPLETED,
                                          lambda event: events.append(event))
    first_id = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    second_id = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=second, weight=460)
    await runtime.storage.hass.async_block_till_done()
    assert [event.event_type for event in events] == [
        EVENT_WEIGHT_RECORDED, EVENT_WEIGHT_RECORDED, EVENT_WEIGHING_SESSION_COMPLETED,
    ]
    assert events[0].data == {
        "litter_id": litter_id, "puppy_id": first, "measurement_id": first_id,
        "weight_g": 450.0,
        "timestamp": runtime.storage.get_measurement(litter_id, first, first_id)["timestamp"],
    }
    assert events[1].data["measurement_id"] == second_id
    assert events[2].data["session_id"] == runtime.weighing_session["id"]
    assert events[2].data["puppy_count"] == 2


async def test_public_weight_event_also_fires_for_automation_outside_session(station):
    runtime, _, _, litter_id, _, _ = station
    idle_runtime = PuppyTrackerRuntimeData(storage=runtime.storage)
    outside_session = await runtime.storage.async_add_puppy(litter_id, "Groen", collar_color="groen")
    events = []
    runtime.storage.hass.bus.async_listen(EVENT_WEIGHT_RECORDED, lambda event: events.append(event))
    await async_record_station_weight(idle_runtime, station_command=False,
                                      litter_id=litter_id, puppy_id=outside_session, weight=450)
    await async_record_station_weight(idle_runtime, station_command=False,
                                      litter_id=litter_id, puppy_id=outside_session, weight=455)
    await runtime.storage.hass.async_block_till_done()
    assert len(events) == 2


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


@pytest.fixture
def reconciled_station(station):
    runtime, *_ = station
    runtime.storage.async_save = PuppyTrackerStorage.async_save.__get__(runtime.storage)
    runtime.storage._store.async_save = AsyncMock()
    return station


async def test_deleted_active_weighing_does_not_complete_the_session(reconciled_station):
    runtime, _, _, litter_id, first, second = reconciled_station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    await runtime.storage.async_delete_weight(litter_id, first, mid)
    await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=second, weight=460)
    assert runtime.weighing_session["status"] == "active"
    assert runtime.weighing_session["weighed_puppy_ids"] == [second]
    assert runtime.selected_puppy_id == first
    assert runtime.storage.get_completed_weighing_summary(litter_id) is None


async def test_correct_restore_and_archive_reconcile_live_session(reconciled_station):
    from custom_components.puppy_tracker.session import sync_station_session

    runtime, _, _, litter_id, first, second = reconciled_station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    corrected = await runtime.storage.async_correct_measurement(litter_id, first, mid, new_weight=455, new_timestamp=None)
    sync_station_session(runtime)
    assert runtime.weighing_session["last_measurement_id"] == corrected
    assert runtime.weighing_session["last_weight"] == 455
    await runtime.storage.async_delete_weight(litter_id, first, corrected)
    sync_station_session(runtime)
    assert runtime.weighing_session["last_measurement_id"] == mid
    assert runtime.weighing_session["weighed_puppy_ids"] == [first]
    await runtime.storage.async_delete_weight(litter_id, first, mid)
    sync_station_session(runtime)
    assert runtime.weighing_session["weighed_puppy_ids"] == []
    await runtime.storage.async_restore_weight(litter_id, first, mid)
    sync_station_session(runtime)
    assert runtime.weighing_session["weighed_puppy_ids"] == [first]
    await runtime.storage.async_set_puppy_active(litter_id, second, False)
    sync_station_session(runtime)
    assert runtime.weighing_session["status"] == "completed"
    assert runtime.weighing_session["puppy_ids"] == [first]


async def test_history_change_never_implicitly_resumes_interrupted_session(reconciled_station):
    from custom_components.puppy_tracker.session import sync_station_session

    runtime, _, _, litter_id, first, _ = reconciled_station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    runtime.weighing_session = recover_session(runtime.storage)
    await runtime.storage.async_delete_weight(litter_id, first, mid)
    sync_station_session(runtime)
    assert runtime.weighing_session["status"] == "interrupted"
    assert runtime.weighing_session["weighed_puppy_ids"] == []


@pytest.mark.parametrize("other_litter", [False, True])
async def test_explicit_actions_work_during_interruption_without_changing_station(reconciled_station, install_litter, other_litter):
    runtime, _, _, litter_id, first, _ = reconciled_station
    runtime.weighing_session = recover_session(runtime.storage)
    runtime.weight_input = 999
    before_session = deepcopy(runtime.weighing_session)
    before_selected = runtime.selected_puppy_id
    if other_litter:
        litter_id, first = install_litter(litter_id="other-litter", puppy_id="other-puppy")
    mid = await async_record_station_weight(runtime, station_command=False,
                                           litter_id=litter_id, puppy_id=first, weight=450)
    assert runtime.storage.get_measurement(litter_id, first, mid)["weight"] == 450
    assert runtime.weighing_session == before_session
    assert runtime.selected_puppy_id == before_selected
    assert runtime.weight_input == 999


async def test_explicit_foreign_action_keeps_draft_and_active_cohort_action_advances(reconciled_station, install_litter):
    runtime, _, _, litter_id, first, second = reconciled_station
    other_litter, other_pup = install_litter(litter_id="other-litter", puppy_id="other-puppy")
    runtime.weight_input = 999
    before = deepcopy(runtime.weighing_session)
    await async_record_station_weight(runtime, station_command=False,
                                     litter_id=other_litter, puppy_id=other_pup, weight=450)
    assert runtime.weight_input == 999
    assert runtime.weighing_session == before
    await async_record_station_weight(runtime, station_command=False,
                                     litter_id=litter_id, puppy_id=first, weight=450)
    assert runtime.weighing_session["weighed_puppy_ids"] == [first]
    assert runtime.selected_puppy_id == second


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


@pytest.mark.parametrize("change", [
    {"version": 99}, {"revision": True}, {"id": []}, {"status": []}, {"puppy_ids": [None]},
    {"measurement_ids": {"puppy-1": None}}, {"last_litter_id": []},
])
@pytest.mark.parametrize("action", ["start", "reset"])
async def test_invalid_checkpoint_does_not_lock_native_controls(reconciled_station, change, action):
    runtime, start, reset, litter_id, first, _ = reconciled_station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    history = runtime.storage.get_puppy(litter_id, first)["measurements"]
    raw = runtime.storage.get_weighing_session()
    raw.update(change)
    runtime.storage._data["weighing_session"] = raw
    runtime.weighing_session = recover_session(runtime.storage)
    assert runtime.weighing_session["status"] == "idle"
    await (start if action == "start" else reset).async_press()
    assert runtime.weighing_session["status"] == ("active" if action == "start" else "idle")
    assert runtime.storage.get_puppy(litter_id, first)["measurements"] == history
    assert runtime.storage.get_measurement(litter_id, first, mid)


@pytest.mark.parametrize("raw", [["invalid"], {"version": 99, "id": "future-session"}])
async def test_loading_discards_only_invalid_operational_state(hass, reconciled_station, raw):
    runtime, _, _, litter_id, first, _ = reconciled_station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    data = runtime.storage.get_data()
    data["weighing_session"] = raw
    fresh = PuppyTrackerStorage(hass)
    fresh._store.async_load = AsyncMock(return_value=data)
    fresh._store.async_save = AsyncMock()
    await fresh.async_load()
    assert fresh.get_weighing_session() is None
    assert fresh.get_measurement(litter_id, first, mid)["weight"] == 450
    assert any(item["action"] == "discard_invalid_weighing_session" for item in fresh.get_data()["audit_log"])


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


async def undo_latest(runtime):
    undo = runtime.weighing_undo
    return await async_undo_station_weight(runtime, undo_id=undo["id"], measurement_id=undo["measurement"]["id"])


async def test_undo_after_auto_advance_returns_to_the_saved_puppy_and_preserves_history(station):
    runtime, _, _, litter_id, first, second = station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    assert runtime.selected_puppy_id == second
    await undo_latest(runtime)
    assert runtime.selected_puppy_id == first
    assert runtime.weighing_session["weighed_puppy_ids"] == []
    assert runtime.weighing_session["status"] == "active"
    assert runtime.weighing_undo is None
    measurement = runtime.storage.get_puppy(litter_id, first)["measurements"][0]
    assert measurement["id"] == mid and measurement["deleted"]
    assert runtime.storage.get_data()["audit_log"][-1]["action"] == "delete_weight"
    assert recover_session(runtime.storage)["weighed_puppy_ids"] == []


async def test_undo_last_puppy_reopens_session_and_restores_previous_completed_summary(station):
    runtime, _, _, litter_id, first, second = station
    prior = {"completed_at": "2026-08-28T12:00:00+00:00"}
    runtime.storage._data["litters"][litter_id]["last_completed_session"] = prior
    await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=second, weight=460)
    assert runtime.weighing_session["status"] == "completed"
    await undo_latest(runtime)
    assert runtime.weighing_session["status"] == "active"
    assert runtime.weighing_session["weighed_puppy_ids"] == [first]
    assert runtime.selected_puppy_id == second
    assert runtime.storage.get_litter(litter_id)["last_completed_session"] == prior


async def test_undo_reweighed_puppy_keeps_its_earlier_session_completion(station):
    runtime, _, _, litter_id, first, _ = station
    original = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=452)
    await undo_latest(runtime)
    assert runtime.weighing_session["weighed_puppy_ids"] == [first]
    active = runtime.storage.get_active_measurements(litter_id, first)
    assert [item["id"] for item in active] == [original]


@pytest.mark.parametrize("change", ["expired", "corrected", "deleted", "newer", "archived", "reset", "foreign_token", "foreign_measurement"])
async def test_undo_rejects_stale_changed_and_foreign_targets_without_writes(station, change):
    runtime, _, reset, litter_id, first, _ = station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    undo = deepcopy(runtime.weighing_undo)
    if change == "expired":
        runtime.weighing_undo["expires_at"] = "2000-01-01T00:00:00+00:00"
    elif change == "corrected":
        await runtime.storage.async_correct_measurement(litter_id, first, mid, new_weight=460, new_timestamp=None)
    elif change == "deleted":
        await runtime.storage.async_delete_weight(litter_id, first, mid)
    elif change == "newer":
        await runtime.storage.async_record_weight(litter_id, first, 470)
    elif change == "archived":
        runtime.storage._data["litters"][litter_id]["puppies"][first]["active"] = False
    elif change == "reset":
        await reset.async_press()
    before = runtime.storage.get_data()
    runtime.storage.async_save.reset_mock()
    with pytest.raises(ValueError):
        await async_undo_station_weight(runtime, undo_id="other" if change == "foreign_token" else undo["id"],
                                        measurement_id="other" if change == "foreign_measurement" else mid)
    assert runtime.storage.get_data() == before
    runtime.storage.async_save.assert_not_awaited()


async def test_failed_undo_keeps_measurement_progress_summary_and_retry_token(station):
    runtime, _, _, litter_id, first, _ = station
    await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    before = runtime.storage.get_data()
    session = deepcopy(runtime.weighing_session)
    token = deepcopy(runtime.weighing_undo)
    runtime.storage.async_save = AsyncMock(side_effect=OSError("disk full"))
    with pytest.raises(OSError):
        await undo_latest(runtime)
    assert runtime.storage.get_data() == before
    assert runtime.weighing_session == session
    assert runtime.weighing_undo == token
    runtime.storage.async_save = AsyncMock()
    await undo_latest(runtime)


async def test_two_undo_requests_cannot_delete_twice(station):
    runtime, _, _, litter_id, first, _ = station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    token = runtime.weighing_undo["id"]
    results = await asyncio.gather(*(async_undo_station_weight(runtime, undo_id=token, measurement_id=mid) for _ in range(2)), return_exceptions=True)
    assert sum(isinstance(value, ValueError) for value in results) == 1
    assert len([item for item in runtime.storage.get_data()["audit_log"] if item["action"] == "delete_weight"]) == 1


async def test_undo_single_weight_outside_session_and_cannot_reuse_token_after_restart(station):
    runtime, _, reset, litter_id, first, _ = station
    await reset.async_press()
    await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    recovered = PuppyTrackerRuntimeData(storage=runtime.storage, weighing_session=recover_session(runtime.storage))
    undo = runtime.weighing_undo
    with pytest.raises(ValueError):
        await async_undo_station_weight(recovered, undo_id=undo["id"], measurement_id=undo["measurement"]["id"])
    await undo_latest(runtime)
    assert runtime.weighing_session["status"] == "idle"


async def test_undo_websocket_updates_the_exact_saved_puppy(hass, station, monkeypatch):
    runtime, _, _, litter_id, first, second = station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    assert runtime.selected_puppy_id == second
    monkeypatch.setattr(api, "get_runtime_data", lambda _: runtime)
    dispatch = Mock()
    monkeypatch.setattr(api, "dispatch_measurement_update", dispatch)
    connection = Mock()
    await unwrap(api.websocket_undo_weighing)(hass, connection, {
        "id": 1, "undo_id": runtime.weighing_undo["id"], "measurement_id": mid,
    })
    connection.send_result.assert_called_once_with(1, {"ok": True})
    dispatch.assert_called_once_with(hass, first)


async def test_undo_expiry_is_checked_again_after_waiting_for_storage(station):
    runtime, _, _, litter_id, first, _ = station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    await runtime.storage._lock.acquire()
    task = asyncio.create_task(async_undo_station_weight(runtime, undo_id=runtime.weighing_undo["id"], measurement_id=mid))
    await asyncio.sleep(0)
    runtime.weighing_undo["expires_at"] = "2000-01-01T00:00:00+00:00"
    runtime.storage._lock.release()
    with pytest.raises(ValueError):
        await task
    assert not runtime.storage.get_puppy(litter_id, first)["measurements"][0]["deleted"]


async def test_later_history_deletion_does_not_resurrect_an_already_closed_session(station):
    runtime, _, _, litter_id, first, second = station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=second, weight=460)
    await runtime.storage.async_delete_weight(litter_id, first, mid)
    assert recover_session(runtime.storage)["status"] == "completed"


async def test_recovery_follows_correction_identity_without_counting_a_second_weighing(station):
    runtime, _, _, litter_id, first, _ = station
    mid = await async_record_station_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    corrected = await runtime.storage.async_correct_measurement(litter_id, first, mid, new_weight=460, new_timestamp=None)
    session = recover_session(runtime.storage)
    assert session["weighed_puppy_ids"] == [first]
    assert session["last_measurement_id"] == corrected
    assert session["last_weight"] == 460
