"""Execution projections retain the canonical owner and completion rules."""

from copy import deepcopy
from datetime import timedelta
from unittest.mock import AsyncMock

import pytest
from homeassistant.auth.const import GROUP_ID_ADMIN, GROUP_ID_READ_ONLY
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.care_execution import async_execution_sources
from custom_components.puppy_tracker.care_program_api import async_setup_care_program_api
from custom_components.puppy_tracker.care_programs import AgeBasedCareProgramStore
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
from custom_components.puppy_tracker.recurring_reminders import RecurringReminderStore
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData


async def prepare(hass, storage, install_litter):
    litter_id, puppy_id = install_litter()
    install_litter(litter_id="other", puppy_id="other-pup")
    store = MotherScopeStorage(hass)
    store._data = deepcopy(storage.get_data())
    store.async_save = AsyncMock()
    store._data["litters"][litter_id]["mother_id"] = "mother-1"
    store._data["litters"]["other"]["mother_id"] = "mother-1"
    store._data["mothers"] = {"mother-1": {"id": "mother-1", "name": "Luna", "records": []}}
    reminders = RecurringReminderStore(hass)
    reminders._store.async_save = AsyncMock()
    return PuppyTrackerRuntimeData(storage=store, recurring_reminders=reminders), litter_id, puppy_id


async def test_execution_followups_scope_horizon_completion_and_inactive_owners(hass, storage, install_litter):
    runtime, litter_id, puppy_id = await prepare(hass, storage, install_litter)
    store = runtime.storage
    today = dt_util.now().date()
    for kwargs in ({}, {"puppy_id": puppy_id}, {"mother_id": "mother-1"}):
        await store.async_add_record(litter_id, **kwargs, record_type="deworming",
                                     data={"product": "Original", "next_due_date": today.isoformat()})
    await store.async_add_record("other", mother_id="mother-1", record_type="test",
                                data={"test_name": "Private other litter", "next_due_date": today.isoformat()})
    await store.async_add_record(litter_id, puppy_id=puppy_id, record_type="vaccination",
                                data={"vaccine": "Later", "next_due_date": (today + timedelta(days=15)).isoformat()})
    litter = store.get_litter(litter_id)
    result = await async_execution_sources(runtime, litter, days_ahead=14)
    assert {item["scope"] for item in result["followups"]} == {"litter", "mother", "puppy"}
    assert len(result["followups"]) == 3
    source = next(item for item in result["followups"] if item["scope"] == "mother")
    await store.async_add_record(litter_id, mother_id="mother-1", record_type="deworming",
                                followup_record_id=source["source_record_id"], followup_due_date=today.isoformat(),
                                data={"product": "Actual"})
    result = await async_execution_sources(runtime, store.get_litter(litter_id), days_ahead=14)
    assert {item["scope"] for item in result["followups"]} == {"litter", "puppy"}
    store._data["litters"][litter_id]["puppies"][puppy_id]["active"] = False
    result = await async_execution_sources(runtime, store.get_litter(litter_id), days_ahead=14)
    assert [item["scope"] for item in result["followups"]] == ["litter"]
    store._data["litters"][litter_id]["active"] = False
    result = await async_execution_sources(runtime, store.get_litter(litter_id), days_ahead=14)
    assert result["followups"] == result["reminders"] == []


async def test_execution_reminders_reconcile_facts_without_predicting_future_slots(hass, storage, install_litter):
    runtime, litter_id, puppy_id = await prepare(hass, storage, install_litter)
    now = dt_util.now()
    ids = []
    for scope, owner in (("puppy", puppy_id), ("mother", "mother-1"), ("litter", litter_id)):
        ids.append(await runtime.recurring_reminders.async_create({
            "litter_id": litter_id, "owner_scope": scope, "owner_id": owner, "title": scope,
            "record_type": "note", "match_title": scope, "schedule_mode": "once",
            "due_at": (now - timedelta(minutes=20)).isoformat(),
            "start_at": (now - timedelta(hours=1)).isoformat(),
        }))
    await runtime.storage.async_add_record(litter_id, puppy_id=puppy_id, record_type="note", title="puppy",
                                           occurred_at=(now - timedelta(minutes=5)).isoformat())
    result = await async_execution_sources(runtime, runtime.storage.get_litter(litter_id), days_ahead=14)
    assert {item["owner_scope"] for item in result["reminders"]} == {"mother", "litter"}
    assert len(result["reminders"]) == 2
    assert all(item["updated_at"] and item["next_due_at"] for item in result["reminders"])
    await runtime.recurring_reminders.async_update(ids[1], {"enabled": False})
    result = await async_execution_sources(runtime, runtime.storage.get_litter(litter_id), days_ahead=14)
    assert [item["owner_scope"] for item in result["reminders"]] == ["litter"]


@pytest.mark.parametrize("admin", [True, False])
async def test_execution_websocket_is_optional_and_exposes_actual_permissions(hass, storage, install_litter, hass_ws_client, admin):
    runtime, litter_id, _ = await prepare(hass, storage, install_litter)
    runtime.care_programs = AgeBasedCareProgramStore(hass)
    runtime.care_programs._store.async_save = AsyncMock()
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = runtime
    entry.add_to_hass(hass)
    async_setup_care_program_api(hass)
    user = await hass.auth.async_create_user("Execution viewer", group_ids=[GROUP_ID_ADMIN if admin else GROUP_ID_READ_ONLY])
    refresh = await hass.auth.async_create_refresh_token(user, client_id="https://test.client")
    client = await hass_ws_client(hass, access_token=hass.auth.async_create_access_token(refresh))
    await client.send_json_auto_id({"type": f"{DOMAIN}/care_occurrences", "litter_id": litter_id})
    baseline = await client.receive_json()
    assert baseline["success"] is True
    assert "execution" not in baseline["result"]
    await client.send_json_auto_id({"type": f"{DOMAIN}/care_occurrences", "litter_id": litter_id, "include_execution": True, "days_ahead": 14})
    result = await client.receive_json()
    assert result["success"] is True
    assert result["result"]["execution"]["can_manage_records"] is admin
    assert "records" not in result["result"]["execution"]["puppies"][0]
    program = await runtime.care_programs.async_create({
        "litter_id": litter_id, "title": "ENS", "record_type": "note",
        "schedule_type": "once", "start_age_days": 3,
    })
    runtime.storage._data["litters"][litter_id]["active"] = False
    await client.send_json_auto_id({"type": f"{DOMAIN}/care_occurrences", "litter_id": litter_id, "include_execution": True})
    inactive = (await client.receive_json())["result"]
    assert inactive["occurrences"] == []
    assert inactive["execution"]["litter"]["active"] is False
    await client.send_json_auto_id({"type": f"{DOMAIN}/care_occurrences", "litter_id": litter_id, "program_id": program})
    assert len((await client.receive_json())["result"]["occurrences"]) == 1


async def test_execution_does_not_hide_failed_reminder_refresh(hass, storage, install_litter):
    runtime, litter_id, _ = await prepare(hass, storage, install_litter)
    runtime.recurring_reminders.async_reconcile_records = AsyncMock(side_effect=RuntimeError("Could not read reminder history"))
    with pytest.raises(RuntimeError, match="Could not read reminder history"):
        await async_execution_sources(runtime, runtime.storage.get_litter(litter_id), days_ahead=14)
