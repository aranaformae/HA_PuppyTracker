"""Execute recurring reminders as owner-safe, recoverable dossier facts."""

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock

import pytest
from homeassistant.setup import async_setup_component

from custom_components.puppy_tracker import recurring_reminder_api as api
from custom_components.puppy_tracker import recurring_reminders as model
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
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
        "occurred_at": NOW.isoformat(), "data": {"temperature_c": 38.4}}
    await client.send_json_auto_id(command)
    result = await client.receive_json()
    assert result["success"], result
    assert result["result"]["record"]["scope"] == scope
    await client.send_json_auto_id(command)
    repeated = await client.receive_json()
    assert repeated["success"]
    assert repeated["result"]["already_completed"]
    assert repeated["result"]["record_id"] == result["result"]["record_id"]
