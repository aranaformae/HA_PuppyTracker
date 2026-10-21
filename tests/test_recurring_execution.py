"""Execute recurring reminders as owner-safe, recoverable dossier facts."""

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock
from zoneinfo import ZoneInfo

import pytest
from homeassistant.setup import async_setup_component

from custom_components.puppy_tracker import recurring_reminder_api as api
from custom_components.puppy_tracker import recurring_reminders as model
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
from custom_components.puppy_tracker.records import normalize_record
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData

NOW = datetime(2026, 10, 20, 12, 10, tzinfo=timezone.utc)


@pytest.fixture
def execution(hass, storage, install_litter, monkeypatch):
    install_litter(litter_overrides={"mother_id": "mother-1"})
    main = MotherScopeStorage(hass)
    main._data = deepcopy(storage._data)
    main._data["mothers"] = {"mother-1": {"id": "mother-1", "name": "Luna", "records": []}}
    main.async_save = AsyncMock()
    store = model.RecurringReminderStore(hass)
    store._store.async_save = AsyncMock()
    monkeypatch.setattr(model.dt_util, "now", lambda: NOW)
    return main, store


async def create(store, scope="puppy", record_type="medication", **changes):
    return await store.async_create({"litter_id": "litter-1", "owner_scope": scope,
        "owner_id": {"puppy": "puppy-1", "mother": "mother-1", "litter": "litter-1"}[scope],
        "title": "Care action", "record_type": record_type, "schedule_mode": "interval",
        "interval_minutes": 60, "start_at": "2026-10-20T11:00:00+00:00", **changes})


async def record(main, store, reminder_id, **changes):
    reminder = store.get_reminder(reminder_id)
    arguments = {"due_at": model.next_due_at(reminder, now=NOW).isoformat(),
                 "expected_updated_at": reminder["updated_at"], "occurred_at": NOW.isoformat(),
                 "title": "Actual execution", "note": "Checked before saving",
                 "data": {"medication": "Example", "dose": "1 ml", "temperature_c": 38.4, "product": "Product", "vaccine": "Vaccine"}}
    arguments.update(changes)
    return await store.async_record_completion(main, reminder_id, **arguments)


@pytest.mark.parametrize("scope", ["puppy", "mother", "litter"])
@pytest.mark.parametrize("record_type", ["medication", "feeding", "temperature", "note", "deworming", "vaccination"])
async def test_execution_creates_new_fact_in_exact_owner_and_advances(execution, scope, record_type):
    main, store = execution
    reminder_id = await create(store, scope, record_type)
    before = store.get_reminder(reminder_id)
    result = await record(main, store, reminder_id)
    assert result["record"]["scope"] == scope
    assert result["record"]["type"] == record_type
    assert result["record"]["note"] == "Checked before saving"
    assert result["record"]["data"]["recurring_reminder_id"] == reminder_id
    assert store.get_reminder(reminder_id) == before  # Only the dossier write is authoritative.
    await store.async_reconcile_records(main)
    updated = store.get_reminder(reminder_id)
    assert model.next_due_at(updated, now=NOW) == NOW + timedelta(hours=1)
    for key in ("owner_scope", "owner_id", "record_type", "schedule_mode", "title"):
        assert updated[key] == before[key]


async def test_concurrent_retry_returns_same_record_without_duplicate_or_cross_completion(execution):
    main, store = execution
    reminder_id = await create(store)
    other_id = await create(store)
    first, second = await asyncio.gather(record(main, store, reminder_id), record(main, store, reminder_id))
    assert first["record_id"] == second["record_id"]
    assert {first["already_completed"], second["already_completed"]} == {False, True}
    assert len(main.get_records("litter-1", "puppy-1")) == 1
    await store.async_reconcile_records(main)
    assert store.get_reminder(reminder_id)["last_completed_record_id"] == first["record_id"]
    assert store.get_reminder(other_id)["last_completed_record_id"] is None


@pytest.mark.parametrize("scope", ["puppy", "mother", "litter"])
async def test_failed_main_write_leaves_reminder_and_history_unchanged(execution, scope):
    main, store = execution
    reminder_id = await create(store, scope)
    before_main, before_store = main.get_data(), store.get_backup_data()
    main.async_save.side_effect = OSError("Disk failure")
    with pytest.raises(OSError):
        await record(main, store, reminder_id)
    assert main.get_data() == before_main
    assert store.get_backup_data() == before_store
    main.async_save.side_effect = None
    result = await record(main, store, reminder_id)
    assert result["already_completed"] is False


async def test_failed_projection_write_never_requires_resaving_execution(execution):
    main, store = execution
    reminder_id = await create(store)
    result = await record(main, store, reminder_id)
    store._store.async_save.side_effect = OSError("Cache failure")
    with pytest.raises(OSError):
        await store.async_reconcile_records(main)
    retry = await record(main, store, reminder_id)
    assert retry["record_id"] == result["record_id"]
    assert retry["already_completed"]
    store._store.async_save.side_effect = None
    await store.async_reconcile_records(main)
    assert store.get_reminder(reminder_id)["last_completed_record_id"] == result["record_id"]


async def test_equal_execution_times_follow_canonical_record_order(execution):
    main, store = execution
    reminder_id = await create(store)
    for index in range(2):
        await main.async_add_record("litter-1", puppy_id="puppy-1", record_type="medication", occurred_at=NOW.isoformat())
        main._data["litters"]["litter-1"]["puppies"]["puppy-1"]["records"][index]["created_at"] = (NOW + timedelta(seconds=index)).isoformat()
    await store.async_reconcile_records(main)
    assert store.get_reminder(reminder_id)["last_completed_record_id"] == main.get_records("litter-1", "puppy-1")[-1]["id"]


async def test_manual_completion_without_record_is_not_replaced_by_older_history(execution):
    main, store = execution
    manual = (NOW - timedelta(minutes=5)).isoformat()
    reminder_id = await create(store, last_completed_at=manual)
    await main.async_add_record("litter-1", puppy_id="puppy-1", record_type="medication", occurred_at=(NOW - timedelta(minutes=10)).isoformat())
    await store.async_reconcile_records(main)
    assert store.get_reminder(reminder_id)["last_completed_at"] == manual
    record_id = await main.async_add_record("litter-1", puppy_id="puppy-1", record_type="medication", occurred_at=NOW.isoformat())
    await store.async_reconcile_records(main)
    assert store.get_reminder(reminder_id)["last_completed_record_id"] == record_id


@pytest.mark.parametrize("changes", [{"expected_updated_at": "old"}, {"due_at": "2026-10-21T12:00:00+00:00"},
    {"occurred_at": "invalid"}, {"occurred_at": "2026-10-21T12:00:00+00:00"}])
async def test_invalid_or_stale_execution_does_not_write(execution, changes):
    main, store = execution
    reminder_id = await create(store)
    before = main.get_data()
    with pytest.raises(ValueError):
        await record(main, store, reminder_id, **changes)
    assert main.get_data() == before


async def test_disabled_or_deleted_reminder_cannot_be_executed(execution):
    main, store = execution
    reminder_id = await create(store, enabled=False)
    with pytest.raises(ValueError, match="disabled"):
        await store.async_record_completion(main, reminder_id, due_at=NOW.isoformat(), expected_updated_at="", occurred_at=NOW.isoformat())
    await store.async_delete(reminder_id)
    with pytest.raises(ValueError, match="no longer exists"):
        await store.async_record_completion(main, reminder_id, due_at=NOW.isoformat(), expected_updated_at="", occurred_at=NOW.isoformat())


@pytest.mark.parametrize("record_type, data", [("temperature", {}), ("temperature", {"temperature_c": "nan"}),
    ("temperature", {"temperature_c": 50}), ("deworming", {}), ("vaccination", {})])
async def test_execution_validates_required_category_fields(execution, record_type, data):
    main, store = execution
    reminder_id = await create(store, record_type=record_type)
    before = main.get_data()
    with pytest.raises(ValueError):
        await record(main, store, reminder_id, data=data)
    assert main.get_data() == before


async def test_once_delete_restore_and_plain_records_remain_supported(execution):
    main, store = execution
    reminder_id = await create(store, schedule_mode="once", due_at="2026-10-20T12:00:00+00:00")
    result = await record(main, store, reminder_id)
    await store.async_reconcile_records(main)
    assert model.reminder_status(store.get_reminder(reminder_id), now=NOW)["status"] == "completed"
    await main.async_delete_record("litter-1", result["record_id"], "puppy-1")
    await store.async_reconcile_records(main)
    assert model.reminder_status(store.get_reminder(reminder_id), now=NOW)["status"] == "overdue"
    await main.async_restore_record("litter-1", result["record_id"], "puppy-1")
    await store.async_reconcile_records(main)
    assert model.reminder_status(store.get_reminder(reminder_id), now=NOW)["status"] == "completed"
    plain = await create(store, record_type="note", match_title="Check")
    await main.async_add_record("litter-1", puppy_id="puppy-1", record_type="note", title="Check", occurred_at=NOW.isoformat())
    await store.async_reconcile_records(main)
    assert store.get_reminder(plain)["last_completed_at"] == NOW.isoformat()


async def test_fixed_schedule_stays_overdue_and_early_completion_consumes_selected_slot(execution, monkeypatch):
    main, store = execution
    reminder_id = await create(store, schedule_mode="fixed_times", fixed_times=["12:00", "14:00", "20:00"])
    reminder = store.get_reminder(reminder_id)
    assert model.next_due_at(reminder, now=NOW).hour == 12
    assert model.reminder_status(reminder, now=NOW)["status"] == "overdue"
    await record(main, store, reminder_id)
    await store.async_reconcile_records(main)
    assert model.next_due_at(store.get_reminder(reminder_id), now=NOW).hour == 14
    monkeypatch.setattr(model.dt_util, "now", lambda: NOW + timedelta(seconds=2))
    result = await record(main, store, reminder_id, occurred_at=(NOW + timedelta(seconds=1)).isoformat())
    await store.async_reconcile_records(main)
    assert model.next_due_at(store.get_reminder(reminder_id), now=NOW + timedelta(seconds=2)).hour == 20
    assert result["record"]["data"]["recurring_due_at"].startswith("2026-10-20T14:00")


@pytest.mark.parametrize("scope", ["puppy", "mother", "litter"])
async def test_real_websocket_completion_route(hass, execution, hass_ws_client, monkeypatch, scope):
    main, store = execution
    reminder_id = await create(store, scope, "temperature")
    runtime = PuppyTrackerRuntimeData(storage=main, recurring_reminders=store)
    monkeypatch.setattr(api, "get_runtime_data", lambda _hass: runtime)
    monkeypatch.setattr(api, "get_runtime_storage", lambda _hass: main)
    await async_setup_component(hass, "websocket_api", {})
    api.async_setup_recurring_reminder_api(hass)
    client = await hass_ws_client(hass)
    command = {"type": "puppy_tracker/recurring_reminder/record", "reminder_id": reminder_id,
        "due_at": "2026-10-20T12:00:00+00:00", "expected_updated_at": store.get_reminder(reminder_id)["updated_at"],
        "occurred_at": NOW.isoformat(), "data": {"temperature_c": 38.4},
        "expected_context": {"litter_id": "litter-1", "owner_scope": scope, "record_type": "temperature",
                             "puppy_id": "puppy-1" if scope == "puppy" else None}}
    await client.send_json_auto_id(command)
    result = await client.receive_json()
    assert result["success"], result
    assert result["result"]["record"]["scope"] == scope
    await client.send_json_auto_id(command)
    repeated = await client.receive_json()
    assert repeated["success"]
    assert repeated["result"]["already_completed"]
    assert repeated["result"]["record_id"] == result["result"]["record_id"]
    await client.send_json_auto_id({"type": "puppy_tracker/recurring_reminders", "litter_id": "litter-1"})
    listed = await client.receive_json()
    assert listed["result"]["reminders"][0]["last_execution"] == result["result"]["record"]
    await client.send_json_auto_id({"type": "puppy_tracker/recurring_reminder/undo", "reminder_id": reminder_id,
        "record_id": result["result"]["record_id"], "expected_record_updated_at": result["result"]["record"]["updated_at"]})
    undone = await client.receive_json()
    assert undone["success"], undone
    await client.send_json_auto_id({"type": "puppy_tracker/recurring_reminders", "litter_id": "litter-1"})
    listed = await client.receive_json()
    assert listed["result"]["reminders"][0]["last_execution"] is None
    assert listed["result"]["reminders"][0]["status"] == "overdue"
    assert listed["result"]["reminders"][0]["owner_available"] is True
    if scope == "puppy":
        del main._data["litters"]["litter-1"]["puppies"]["puppy-1"]
    elif scope == "mother":
        main._data["litters"]["litter-1"]["mother_id"] = None
    else:
        del main._data["litters"]["litter-1"]
    await client.send_json_auto_id({"type": "puppy_tracker/recurring_reminders", "litter_id": "litter-1"})
    listed = await client.receive_json()
    assert listed["result"]["reminders"][0]["owner_available"] is False
    assert listed["result"]["reminders"][0]["last_execution"] is None


async def undo(main, store, reminder_id, saved, **changes):
    arguments = {"record_id": saved["record_id"], "expected_record_updated_at": saved["record"]["updated_at"]}
    arguments.update(changes)
    await store.async_undo_completion(main, reminder_id, **arguments)


@pytest.mark.parametrize("scope", ["puppy", "mother", "litter"])
@pytest.mark.parametrize("mode", ["once", "interval", "fixed_times"])
async def test_undo_restores_planning_and_retains_previous_history(execution, scope, mode):
    main, store = execution
    reminder_id = await create(store, scope, schedule_mode=mode, due_at="2026-10-20T12:00:00+00:00", fixed_times=["12:00", "14:00"])
    owner = {"puppy_id": "puppy-1"} if scope == "puppy" else {"mother_id": "mother-1"} if scope == "mother" else {}
    old_id = await main.async_add_record("litter-1", **owner, record_type="note", note="Keep original",
                                        occurred_at=(NOW - timedelta(days=1)).isoformat())
    old = main.get_record("litter-1", old_id, **owner)
    due_before = model.next_due_at(store.get_reminder(reminder_id), now=NOW)
    saved = await record(main, store, reminder_id)
    await store.async_reconcile_records(main)
    await undo(main, store, reminder_id, saved)
    await store.async_reconcile_records(main)
    assert main.get_record("litter-1", old_id, **owner) == old
    assert main.get_record("litter-1", saved["record_id"], **owner)["deleted"]
    assert model.next_due_at(store.get_reminder(reminder_id), now=NOW) == due_before
    with pytest.raises(ValueError):
        await undo(main, store, reminder_id, saved)


@pytest.mark.parametrize("scope", ["puppy", "mother", "litter"])
async def test_failed_undo_rolls_back_all_data_and_can_retry(execution, scope):
    main, store = execution
    reminder_id = await create(store, scope)
    saved = await record(main, store, reminder_id)
    before = main.get_data()
    main.async_save.side_effect = OSError("Disk failure")
    with pytest.raises(OSError):
        await undo(main, store, reminder_id, saved)
    assert main.get_data() == before
    main.async_save.side_effect = None
    await undo(main, store, reminder_id, saved)


@pytest.mark.parametrize("change", ["edited", "newer", "other_reminder", "disabled", "removed", "moved", "revision"])
async def test_undo_rejects_changed_or_unrelated_execution(execution, change):
    main, store = execution
    reminder_id = await create(store)
    saved = await record(main, store, reminder_id)
    if change == "edited":
        await main.async_update_record("litter-1", saved["record_id"], puppy_id="puppy-1", record_type="medication", note="Corrected")
    elif change == "newer":
        await main.async_add_record("litter-1", puppy_id="puppy-1", record_type="medication", occurred_at=NOW.isoformat())
        latest = main._data["litters"]["litter-1"]["puppies"]["puppy-1"]["records"][-1]
        latest["created_at"] = (datetime.fromisoformat(saved["record"]["created_at"]) + timedelta(seconds=1)).isoformat()
    elif change == "other_reminder":
        reminder_id = await create(store)
    elif change == "disabled":
        await store.async_update(reminder_id, {"enabled": False})
    elif change == "removed":
        await store.async_delete(reminder_id)
    elif change == "moved":
        await main.async_change_record_owner("litter-1", saved["record_id"], source_scope="puppy", source_puppy_id="puppy-1", target_scope="litter")
    before = main.get_data()
    with pytest.raises(ValueError):
        await undo(main, store, reminder_id, saved, **({"expected_record_updated_at": "old"} if change == "revision" else {}))
    assert main.get_data() == before


async def test_undo_validation_runs_after_waiting_for_main_storage_lock(execution):
    main, store = execution
    reminder_id = await create(store)
    saved = await record(main, store, reminder_id)
    async with main._lock:
        pending = asyncio.create_task(undo(main, store, reminder_id, saved))
        await asyncio.sleep(0)
        main._data["litters"]["litter-1"]["puppies"]["puppy-1"]["records"][0]["updated_at"] = "edited-during-wait"
    with pytest.raises(ValueError):
        await pending
    assert not main.get_record("litter-1", saved["record_id"], "puppy-1")["deleted"]


async def test_undo_revalidates_mother_link_under_main_storage_lock(execution):
    main, store = execution
    reminder_id = await create(store, "mother")
    saved = await record(main, store, reminder_id)
    async with main._lock:
        pending = asyncio.create_task(undo(main, store, reminder_id, saved))
        await asyncio.sleep(0)
        main._data["litters"]["litter-1"]["mother_id"] = None
    with pytest.raises(ValueError):
        await pending
    assert not main.get_record("litter-1", saved["record_id"], mother_id="mother-1")["deleted"]


async def test_undo_without_projection_or_with_failed_projection_keeps_older_matching_fact(execution):
    main, store = execution
    reminder_id = await create(store)
    old_id = await main.async_add_record("litter-1", puppy_id="puppy-1", record_type="medication",
        occurred_at=(NOW - timedelta(minutes=30)).isoformat(), note="Older actual administration")
    await store.async_reconcile_records(main)
    saved = await record(main, store, reminder_id)
    store._store.async_save.side_effect = OSError("Projection unavailable")
    await undo(main, store, reminder_id, saved)
    assert main.get_record("litter-1", old_id, "puppy-1")["note"] == "Older actual administration"
    store._store.async_save.side_effect = None
    await store.async_reconcile_records(main)
    assert store.get_reminder(reminder_id)["last_completed_record_id"] == old_id
    assert model.next_due_at(store.get_reminder(reminder_id), now=NOW) == NOW + timedelta(minutes=30)


async def test_undo_after_reconciliation_preserves_legacy_manual_completion_and_backup(execution):
    main, store = execution
    manual = NOW - timedelta(minutes=30)
    reminder_id = await create(store, last_completed_at=manual.isoformat())
    await main.async_add_record("litter-1", puppy_id="puppy-1", record_type="medication", occurred_at=(manual - timedelta(minutes=5)).isoformat())
    saved = await record(main, store, reminder_id)
    await store.async_reconcile_records(main)
    backup = store.get_backup_data()
    await store.async_restore_backup_data(backup)
    await undo(main, store, reminder_id, saved)
    await store.async_reconcile_records(main)
    reminder = store.get_reminder(reminder_id)
    assert reminder["last_completed_at"] == manual.isoformat()
    assert reminder["last_completed_record_id"] is None
    assert model.next_due_at(reminder, now=NOW) == manual + timedelta(hours=1)


@pytest.mark.parametrize("legacy", [False, True])
async def test_list_never_invents_last_execution_from_unrelated_history(hass, execution, hass_ws_client, monkeypatch, legacy):
    main, store = execution
    reminder_id = await create(store, match_title="Exact title", **({"last_completed_at": NOW.isoformat()} if legacy else {}))
    await main.async_add_record("litter-1", puppy_id="puppy-1", record_type="medication", title="Another title", occurred_at=NOW.isoformat())
    await main.async_add_record("litter-1", record_type="medication", title="Exact title", occurred_at=NOW.isoformat())
    runtime = PuppyTrackerRuntimeData(storage=main, recurring_reminders=store)
    monkeypatch.setattr(api, "get_runtime_data", lambda _hass: runtime)
    monkeypatch.setattr(api, "get_runtime_storage", lambda _hass: main)
    await async_setup_component(hass, "websocket_api", {})
    api.async_setup_recurring_reminder_api(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "puppy_tracker/recurring_reminders", "litter_id": "litter-1"})
    response = await client.receive_json()
    reminder = response["result"]["reminders"][0]
    assert reminder["id"] == reminder_id
    assert reminder["last_execution"] is None
    assert bool(reminder["last_completed_at"]) == legacy


@pytest.mark.parametrize("scope", ["puppy", "mother", "litter"])
async def test_log_only_never_completes_any_reminder_even_after_edit_and_reload(execution, scope):
    main, store = execution
    ids = [await create(store, scope, "feeding") for _ in range(2)]
    owner = {"puppy_id": "puppy-1"} if scope == "puppy" else {"mother_id": "mother-1"} if scope == "mother" else {}
    before = store.get_backup_data()
    record_id = await main.async_add_record("litter-1", **owner, record_type="feeding", occurred_at=NOW.isoformat(),
        data={"feeding_type": "Bottle", "amount": 30, "unit": "ml", "recurring_completion": "none"})
    entry = main.get_record("litter-1", record_id, **owner)
    await main.async_update_record("litter-1", record_id, **owner, record_type="feeding", note="Corrected log only", data=entry["data"])
    restored = main.get_record("litter-1", record_id, **owner)
    normalize_record(restored, litter_id="litter-1", puppy_id=owner.get("puppy_id"), mother_id=owner.get("mother_id"))
    assert restored["data"]["recurring_completion"] == "none"
    await store.async_reconcile_records(main)
    assert store.get_backup_data() == before
    assert all(not model.reminder_matches_record(store.get_reminder(reminder_id), entry) for reminder_id in ids)


@pytest.mark.parametrize("scope", ["puppy", "mother", "litter"])
async def test_log_only_disk_failure_rolls_back_runtime_data(execution, scope):
    main, _store = execution
    owner = {"puppy_id": "puppy-1"} if scope == "puppy" else {"mother_id": "mother-1"} if scope == "mother" else {}
    before = main.get_data()
    main.async_save.side_effect = OSError("Disk failure")
    with pytest.raises(OSError):
        await main.async_add_record("litter-1", **owner, record_type="note", occurred_at=NOW.isoformat(),
            note="Only log this observation", data={"recurring_completion": "none"})
    assert main.get_data() == before


@pytest.mark.parametrize("scope", ["puppy", "mother", "litter"])
@pytest.mark.parametrize("changes", [{"litter_id": "other"}, {"owner_scope": "wrong"}, {"puppy_id": "other"}, {"record_type": "temperature"}])
async def test_selected_reminder_rejects_wrong_context_even_on_retry(execution, scope, changes):
    main, store = execution
    reminder_id = await create(store, scope)
    context = {"litter_id": "litter-1", "owner_scope": scope, "record_type": "medication",
               "puppy_id": "puppy-1" if scope == "puppy" else None}
    for completed in (False, True):
        before = main.get_data()
        with pytest.raises(ValueError, match="selected owner or category"):
            await record(main, store, reminder_id, expected_context={**context, **changes})
        assert main.get_data() == before
        if not completed:
            await record(main, store, reminder_id, expected_context=context)


async def test_explicit_execution_overrides_log_only_but_never_completes_another_reminder(execution):
    main, store = execution
    selected, other = await create(store), await create(store)
    result = await record(main, store, selected, data={"medication": "Example", "recurring_completion": "none"})
    assert "recurring_completion" not in result["record"]["data"]
    await store.async_reconcile_records(main)
    assert store.get_reminder(selected)["last_completed_record_id"] == result["record_id"]
    assert store.get_reminder(other)["last_completed_record_id"] is None


async def postpone(main, store, reminder_id, until, **changes):
    reminder = store.get_reminder(reminder_id)
    arguments = {"due_at": model.next_due_at(reminder, now=NOW).isoformat(),
                 "expected_updated_at": reminder["updated_at"], "until": until}
    arguments.update(changes)
    await store.async_postpone(main, reminder_id, **arguments)


@pytest.mark.parametrize("scope", ["puppy", "mother", "litter"])
@pytest.mark.parametrize("mode", ["interval", "once", "fixed_times"])
async def test_postpone_is_portable_and_does_not_change_definition_or_create_execution(execution, scope, mode):
    main, store = execution
    reminder_id = await create(store, scope, schedule_mode=mode, fixed_times=["12:00", "14:00"],
                               due_at="2026-10-20T12:00:00+00:00")
    original = store.get_reminder(reminder_id)
    before = main.get_data()
    target = NOW + timedelta(minutes=30)
    await postpone(main, store, reminder_id, target.isoformat())
    item = store.get_reminder(reminder_id)
    assert main.get_data() == before
    assert {key: value for key, value in item.items() if key not in {"postponement", "updated_at"}} == {
        key: value for key, value in original.items() if key not in {"postponement", "updated_at"}}
    state = model.reminder_status(item, now=NOW, notification_lead_minutes=10080)
    assert state["status"] == "postponed"
    assert state["next_due_at"] == target.isoformat()
    assert state["scheduled_due_at"] == original["due_at"]
    assert model.reminder_status(item, now=target)["status"] == "due_soon"
    assert model.reminder_status(item, now=target + timedelta(minutes=1))["status"] == "overdue"
    backup = store.get_backup_data()
    await store.async_restore_backup_data(backup)
    store._store.async_load = AsyncMock(return_value=backup)
    await store.async_load()
    assert store.get_backup_data() == backup
    assert model.next_due_at(store.get_reminder(reminder_id), now=NOW) == target
    await postpone(main, store, reminder_id, None)
    assert model.next_due_at(store.get_reminder(reminder_id), now=NOW) == model.next_due_at(original, now=NOW)


@pytest.mark.parametrize("mode", ["interval", "once", "fixed_times"])
async def test_postponed_execution_is_idempotent_consumes_original_slot_and_undo_reopens_it(execution, mode):
    main, store = execution
    reminder_id = await create(store, schedule_mode=mode, fixed_times=["12:00", "13:00"],
                               due_at="2026-10-20T12:00:00+00:00")
    await postpone(main, store, reminder_id, (NOW + timedelta(minutes=20)).isoformat())
    snapshot = store.get_reminder(reminder_id)
    due = model.next_due_at(snapshot, now=NOW).isoformat()
    saved = await record(main, store, reminder_id)
    assert saved["record"]["data"]["recurring_scheduled_at"] == "2026-10-20T12:00:00+00:00"
    assert saved["record"]["data"]["recurring_due_at"] == due
    await store.async_reconcile_records(main)
    item = store.get_reminder(reminder_id)
    assert not model.reminder_status(item, now=NOW)["postponed"]
    expected = None if mode == "once" else NOW + timedelta(minutes=60) if mode == "interval" else NOW.replace(hour=13, minute=0)
    assert model.next_due_at(item, now=NOW) == expected
    retry = await store.async_record_completion(main, reminder_id, due_at=due,
        expected_updated_at=snapshot["updated_at"], occurred_at=NOW.isoformat())
    assert retry["already_completed"]
    assert retry["record_id"] == saved["record_id"]
    await undo(main, store, reminder_id, saved)
    await store.async_reconcile_records(main)
    assert model.next_due_at(store.get_reminder(reminder_id), now=NOW).isoformat() == due
    await main.async_restore_record("litter-1", saved["record_id"], "puppy-1")
    await store.async_reconcile_records(main)
    assert model.next_due_at(store.get_reminder(reminder_id), now=NOW) == expected


@pytest.mark.parametrize("changes", [{"until": ""}, {"until": "invalid"}, {"until": NOW.isoformat()},
    {"until": "2026-10-20T11:00:00Z"}, {"expected_updated_at": "stale"}, {"due_at": "2026-10-21T12:00:00Z"}])
async def test_postpone_rejects_invalid_or_stale_request_without_writing(execution, changes):
    main, store = execution
    reminder_id = await create(store)
    before = store.get_backup_data()
    arguments = {"until": (NOW + timedelta(hours=1)).isoformat(), **changes}
    with pytest.raises(ValueError):
        await postpone(main, store, reminder_id, **arguments)
    assert store.get_backup_data() == before


async def test_repeated_postpone_and_failed_save_are_atomic(execution):
    main, store = execution
    reminder_id = await create(store)
    first = (NOW + timedelta(minutes=30)).isoformat()
    await postpone(main, store, reminder_id, first)
    with pytest.raises(ValueError):
        await postpone(main, store, reminder_id, first)
    before = store.get_backup_data()
    store._store.async_save.side_effect = OSError("Disk failure")
    with pytest.raises(OSError):
        await postpone(main, store, reminder_id, (NOW + timedelta(hours=1)).isoformat())
    assert store.get_backup_data() == before
    with pytest.raises(OSError):
        await postpone(main, store, reminder_id, None)
    assert store.get_backup_data() == before
    store._store.async_save.side_effect = None
    await postpone(main, store, reminder_id, (NOW + timedelta(hours=1)).isoformat())
    assert model.active_postponement(store.get_reminder(reminder_id), now=NOW)["scheduled_at"] == "2026-10-20T12:00:00+00:00"


@pytest.mark.parametrize("changes", [{"interval_minutes": 120}, {"owner_id": "puppy-2"}, {"enabled": False},
                                    {"record_type": "note"}, {"match_title": "New"}])
async def test_definition_changes_remove_stale_postponement(execution, changes):
    main, store = execution
    reminder_id = await create(store)
    await postpone(main, store, reminder_id, (NOW + timedelta(minutes=30)).isoformat())
    await store.async_update(reminder_id, changes)
    assert store.get_reminder(reminder_id)["postponement"] is None


async def test_postpone_reconciles_against_real_history_and_invalid_owner(execution):
    main, store = execution
    reminder_id = await create(store)
    saved = await record(main, store, reminder_id)
    with pytest.raises(ValueError, match="changed"):
        await postpone(main, store, reminder_id, (NOW + timedelta(hours=2)).isoformat())
    await store.async_reconcile_records(main)
    await postpone(main, store, reminder_id, (NOW + timedelta(hours=2)).isoformat())
    assert store.get_reminder(reminder_id)["postponement"]["completed_record_id"] == saved["record_id"]
    del main._data["litters"]["litter-1"]["puppies"]["puppy-1"]
    with pytest.raises(ValueError, match="owner"):
        await postpone(main, store, reminder_id, None)


async def test_postponement_never_leaks_into_a_later_completion(execution):
    main, store = execution
    reminder_id = await create(store)
    await postpone(main, store, reminder_id, (NOW + timedelta(hours=3)).isoformat())
    await main.async_add_record("litter-1", puppy_id="puppy-1", record_type="medication", occurred_at=NOW.isoformat())
    await store.async_reconcile_records(main)
    item = store.get_reminder(reminder_id)
    assert model.next_due_at(item, now=NOW) == NOW + timedelta(hours=1)
    assert not model.reminder_status(item, now=NOW)["postponed"]


async def test_fixed_schedule_boundary_preserves_next_slot_across_midnight(execution):
    main, store = execution
    reminder_id = await create(store, schedule_mode="fixed_times", fixed_times=["00:15", "23:30"],
                               start_at="2026-10-20T23:00:00Z")
    boundary = model.postpone_before(store.get_reminder(reminder_id), now=NOW)
    assert boundary.isoformat() == "2026-10-21T00:15:00+00:00"
    for target in (boundary, boundary + timedelta(minutes=1)):
        with pytest.raises(ValueError, match="next fixed"):
            await postpone(main, store, reminder_id, target.isoformat())
    await postpone(main, store, reminder_id, (boundary - timedelta(seconds=1)).isoformat())


async def test_postpone_websocket_changes_only_pending_moment(hass, execution, hass_ws_client, monkeypatch):
    main, store = execution
    reminder_id = await create(store)
    runtime = PuppyTrackerRuntimeData(storage=main, recurring_reminders=store)
    monkeypatch.setattr(api, "get_runtime_data", lambda _hass: runtime)
    monkeypatch.setattr(api, "get_runtime_storage", lambda _hass: main)
    await async_setup_component(hass, "websocket_api", {})
    api.async_setup_recurring_reminder_api(hass)
    client = await hass_ws_client(hass)
    reminder = store.get_reminder(reminder_id)
    message = {"type": "puppy_tracker/recurring_reminder/postpone", "reminder_id": reminder_id,
               "due_at": model.next_due_at(reminder, now=NOW).isoformat(),
               "expected_updated_at": reminder["updated_at"], "until": (NOW + timedelta(minutes=30)).isoformat()}
    await client.send_json_auto_id(message)
    assert (await client.receive_json())["success"]
    await client.send_json_auto_id(message)
    response = await client.receive_json()
    assert not response["success"]
    assert response["error"]["code"] == "invalid_postponement"
    assert not main.get_records("litter-1", "puppy-1")


async def test_postponement_retracts_both_notifications_until_target_then_notifies_once(hass, execution, monkeypatch):
    from custom_components.puppy_tracker import recurring_notifications as notifications

    main, store = execution
    main._data["settings"]["recurring_reminder_notifications_enabled"] = True
    reminder_id = await create(store, notification_lead_minutes=120)
    runtime = PuppyTrackerRuntimeData(storage=main, recurring_reminders=store)
    manager = notifications.RecurringReminderNotificationManager(hass, MagicMock(), runtime)
    send, clear = AsyncMock(), AsyncMock()
    create_notification, dismiss = MagicMock(), MagicMock()
    monkeypatch.setattr(notifications, "async_reconcile_recurring_reminders", AsyncMock())
    monkeypatch.setattr(notifications, "async_check_care_notifications", AsyncMock())
    monkeypatch.setattr(notifications, "async_send_notify_entities", send)
    monkeypatch.setattr(notifications, "async_clear_notify_entities", clear)
    monkeypatch.setattr(notifications, "async_create_persistent_notification", create_notification)
    monkeypatch.setattr(notifications, "async_dismiss_persistent_notification", dismiss)
    await manager.async_check()
    send.assert_awaited_once()
    create_notification.assert_called_once()
    target = NOW + timedelta(minutes=30)
    await postpone(main, store, reminder_id, target.isoformat())
    await manager.async_check()
    await manager.async_check()
    clear.assert_awaited_once()
    dismiss.assert_called_once()
    assert send.await_count == 1
    monkeypatch.setattr(model.dt_util, "now", lambda: target - timedelta(seconds=1))
    await manager.async_check()
    assert send.await_count == 1
    monkeypatch.setattr(model.dt_util, "now", lambda: target)
    await manager.async_check()
    await manager.async_check()
    assert send.await_count == 2
    assert create_notification.call_count == 2


async def test_disabled_missing_reminders_and_malformed_backup_cannot_postpone(execution):
    main, store = execution
    reminder_id = await create(store, enabled=False)
    for identifier in (reminder_id, "missing"):
        with pytest.raises(ValueError, match="disabled"):
            await store.async_postpone(main, identifier, due_at=NOW.isoformat(), expected_updated_at="old", until=None)
    before = store.get_backup_data()
    for value in ([], {}, {"scheduled_at": "bad", "until": NOW.isoformat()},
                  {"scheduled_at": NOW.isoformat(), "until": (NOW - timedelta(minutes=1)).isoformat()}):
        backup = deepcopy(before)
        backup["reminders"][reminder_id]["postponement"] = value
        with pytest.raises(ValueError):
            await store.async_restore_backup_data(backup)
        assert store.get_backup_data() == before


async def test_fixed_slot_postpone_boundary_uses_target_date_timezone(execution):
    _main, store = execution
    timezone = ZoneInfo("Europe/Amsterdam")
    local_now = datetime(2026, 10, 24, 23, 45, tzinfo=timezone)
    reminder_id = await create(store, schedule_mode="fixed_times", fixed_times=["10:00", "23:30"],
                               start_at="2026-10-24T23:00:00+02:00")
    reminder = store.get_reminder(reminder_id)
    assert model.scheduled_due_at(reminder, now=local_now).isoformat() == "2026-10-24T23:30:00+02:00"
    assert model.postpone_before(reminder, now=local_now).isoformat() == "2026-10-25T10:00:00+01:00"


@pytest.mark.parametrize("mode", ["interval", "fixed_times", "once"])
async def test_execution_after_postponed_deadline_keeps_normal_next_recurrence(execution, monkeypatch, mode):
    main, store = execution
    reminder_id = await create(store, schedule_mode=mode, fixed_times=["12:00", "13:00"],
                               due_at="2026-10-20T12:00:00Z")
    target = NOW + timedelta(minutes=20)
    await postpone(main, store, reminder_id, target.isoformat())
    occurred = target + timedelta(minutes=2)
    monkeypatch.setattr(model.dt_util, "now", lambda: occurred)
    saved = await record(main, store, reminder_id, occurred_at=occurred.isoformat())
    await store.async_reconcile_records(main)
    reminder = store.get_reminder(reminder_id)
    assert reminder["last_completed_record_id"] == saved["record_id"]
    assert not model.reminder_status(reminder, now=occurred)["postponed"]
    expected = occurred + timedelta(hours=1) if mode == "interval" else occurred.replace(hour=13, minute=0) if mode == "fixed_times" else None
    assert model.next_due_at(reminder, now=occurred) == expected
