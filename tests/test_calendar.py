"""Calendar projections use pending care, not historical dossier content."""

from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.calendar import (
    LitterCareCalendar, async_setup_entry, care_calendar_events,
)
from custom_components.puppy_tracker.care_occurrences import derive_puppy_care_occurrences
from custom_components.puppy_tracker.care_programs import normalize_care_program
from custom_components.puppy_tracker.const import DOMAIN, SIGNAL_NEW_LITTER
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
from custom_components.puppy_tracker.recurring_reminders import (
    completion_state_from_records, normalize_reminder, reminder_owner_records,
)
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData


def _window(end_day: int = 3):
    return (datetime(2026, 8, 30, tzinfo=timezone.utc),
            datetime(2026, 9, end_day, tzinfo=timezone.utc))


async def test_calendar_shows_open_followups_and_care_then_hides_completed(storage, install_litter):
    litter_id, puppy_id = install_litter()
    program = normalize_care_program({
        "id": "ens", "litter_id": litter_id, "title": "ENS", "record_type": "note",
        "schedule_type": "once", "start_age_days": 3, "time_of_day": "09:00",
    })
    runtime = PuppyTrackerRuntimeData(
        storage=storage,
        care_programs=SimpleNamespace(get_programs=lambda **kwargs: [program]),
    )
    source_id = await storage.async_add_record(
        litter_id, puppy_id=puppy_id, record_type="deworming", note="Private worming note",
        data={"product": "Private product", "next_due_date": "2026-09-01"},
    )
    start, end = _window()
    events = care_calendar_events(runtime, litter_id, start, end)
    assert len(events) == 2
    assert [item.uid for item in events] == [
        f"care:ens:{puppy_id}:3", f"dossier:{source_id}:next_due_date",
    ]
    assert events[0].start.hour == 9
    assert events[1].all_day is True
    assert "Private" not in str(events)

    occurrence = derive_puppy_care_occurrences(program, storage.get_puppy(litter_id, puppy_id))[0]
    await storage.async_add_record(
        litter_id, puppy_id=puppy_id, record_type="note",
        data={"care_occurrence_id": occurrence["id"], "care_status": "completed"},
    )
    await storage.async_add_record(
        litter_id, puppy_id=puppy_id, record_type="deworming",
        followup_record_id=source_id, followup_due_date="2026-09-01",
        data={"product": "New product"},
    )
    assert care_calendar_events(runtime, litter_id, start, end) == []


async def test_calendar_query_respects_exclusive_end_and_inactive_litter(storage, install_litter):
    litter_id, puppy_id = install_litter()
    runtime = PuppyTrackerRuntimeData(storage=storage)
    await storage.async_add_record(
        litter_id, puppy_id=puppy_id, record_type="vaccination",
        data={"vaccine": "DP", "next_due_date": "2026-09-01"},
    )
    assert care_calendar_events(runtime, litter_id, *_window(end_day=1)) == []
    assert len(care_calendar_events(runtime, litter_id, *_window(end_day=2))) == 1
    assert care_calendar_events(runtime, "missing", *_window(end_day=2)) == []
    storage._data["litters"][litter_id]["active"] = False
    assert care_calendar_events(runtime, litter_id, *_window(end_day=2)) == []


async def test_calendar_includes_mother_followup_only_for_its_litter(hass, storage, install_litter):
    litter_id, _ = install_litter()
    mother_storage = MotherScopeStorage(hass)
    mother_storage._data = deepcopy(storage.get_data())
    mother_storage._data["litters"][litter_id]["mother_id"] = "mother-1"
    mother_storage._data["mothers"] = {"mother-1": {"id": "mother-1", "name": "Luna", "records": []}}
    mother_storage.async_save = AsyncMock()
    runtime = PuppyTrackerRuntimeData(storage=mother_storage)
    source_id = await mother_storage.async_add_record(
        litter_id, mother_id="mother-1", record_type="deworming",
        data={"product": "Test", "next_due_date": "2026-09-01"},
    )
    events = care_calendar_events(runtime, litter_id, *_window())
    assert len(events) == 1
    assert events[0].summary == "Ontworming · Moederhond"
    await mother_storage.async_add_record(
        litter_id, mother_id="mother-1", record_type="deworming",
        followup_record_id=source_id, followup_due_date="2026-09-01",
        data={"product": "Done"},
    )
    assert care_calendar_events(runtime, litter_id, *_window()) == []


async def test_calendar_reminder_completion_and_undo_follow_dossier_history(storage, install_litter):
    litter_id, puppy_id = install_litter()
    reminder = normalize_reminder({
        "id": "once-1", "litter_id": litter_id, "owner_scope": "puppy", "owner_id": puppy_id,
        "title": "Controle", "record_type": "note", "match_title": "Controle gedaan",
        "schedule_mode": "once", "start_at": "2026-08-30T08:00:00+00:00",
        "due_at": "2026-09-01T10:00:00+00:00",
    })
    runtime = PuppyTrackerRuntimeData(
        storage=storage,
        recurring_reminders=SimpleNamespace(get_reminders=lambda **kwargs: [reminder]),
    )
    events = care_calendar_events(runtime, litter_id, *_window())
    assert len(events) == 1
    assert events[0].uid == "reminder:once-1"
    assert events[0].summary == "Herinnering · Controle · Groen"
    assert events[0].start.hour == 10

    completion_id = await storage.async_add_record(
        litter_id, puppy_id=puppy_id, record_type="note", title="Controle gedaan",
        occurred_at="2026-09-01T10:15:00+00:00", note="Private details",
    )
    assert care_calendar_events(runtime, litter_id, *_window()) == []
    await storage.async_delete_record(litter_id, completion_id, puppy_id)
    assert [item.uid for item in care_calendar_events(runtime, litter_id, *_window())] == ["reminder:once-1"]
    storage._data["litters"][litter_id]["puppies"][puppy_id]["active"] = False
    assert care_calendar_events(runtime, litter_id, *_window()) == []


async def test_calendar_interval_and_fixed_reminders_show_only_current_moment(storage, install_litter):
    litter_id, puppy_id = install_litter()
    local_zone = dt_util.get_default_time_zone()

    def local_time(hour: int, minute: int = 0) -> str:
        return datetime(2026, 9, 1, hour, minute, tzinfo=local_zone).isoformat()

    interval = normalize_reminder({
        "id": "interval-1", "litter_id": litter_id, "owner_scope": "puppy", "owner_id": puppy_id,
        "title": "Voeren", "record_type": "note", "match_title": "Voeding gegeven",
        "schedule_mode": "interval", "interval_minutes": 240,
        "start_at": "2026-09-01T08:00:00+00:00",
    })
    fixed = normalize_reminder({
        "id": "fixed-1", "litter_id": litter_id, "owner_scope": "litter",
        "title": "Nestcontrole", "record_type": "note", "match_title": "Nest nagekeken",
        "schedule_mode": "fixed_times", "fixed_times": ["08:00", "14:00"],
        "start_at": local_time(7),
    })
    disabled = normalize_reminder({**fixed, "id": "disabled", "enabled": False})
    runtime = PuppyTrackerRuntimeData(
        storage=storage,
        recurring_reminders=SimpleNamespace(get_reminders=lambda **kwargs: [interval, fixed, disabled]),
    )
    events = care_calendar_events(runtime, litter_id, *_window())
    assert {item.uid: item.start.hour for item in events} == {
        "reminder:fixed-1": 8, "reminder:interval-1": 12,
    }

    await storage.async_add_record(
        litter_id, puppy_id=puppy_id, record_type="note", title="Voeding gegeven",
        occurred_at="2026-09-01T13:00:00+00:00",
    )
    fixed_completion = await storage.async_add_record(
        litter_id, record_type="note", title="Nest nagekeken",
        occurred_at=local_time(8, 5),
        data={"recurring_due_at": local_time(8)},
    )
    assert completion_state_from_records(
        fixed, reminder_owner_records(storage, fixed), datetime.now(timezone.utc),
    )["last_completed_record_id"] == fixed_completion
    events = care_calendar_events(runtime, litter_id, *_window())
    assert {item.uid: item.start.hour for item in events} == {
        "reminder:fixed-1": 14, "reminder:interval-1": 17,
    }

    fixed["postponement"] = {
        "scheduled_at": local_time(14),
        "until": local_time(15),
        "completed_at": local_time(8, 5),
        "completed_record_id": fixed_completion,
    }
    events = care_calendar_events(runtime, litter_id, *_window())
    assert {item.uid: item.start.hour for item in events} == {
        "reminder:fixed-1": 15, "reminder:interval-1": 17,
    }


async def test_calendar_mother_reminder_keeps_litter_scope(hass, storage, install_litter):
    litter_id, _ = install_litter()
    mother_storage = MotherScopeStorage(hass)
    mother_storage._data = deepcopy(storage.get_data())
    mother_storage._data["litters"][litter_id]["mother_id"] = "mother-1"
    mother_storage._data["mothers"] = {"mother-1": {"id": "mother-1", "name": "Luna", "records": []}}
    reminder = normalize_reminder({
        "id": "mother-1", "litter_id": litter_id, "owner_scope": "mother", "owner_id": "mother-1",
        "title": "Temperatuur", "record_type": "temperature", "schedule_mode": "once",
        "start_at": "2026-08-30T08:00:00+00:00", "due_at": "2026-09-01T09:00:00+00:00",
    })
    runtime = PuppyTrackerRuntimeData(
        storage=mother_storage,
        recurring_reminders=SimpleNamespace(get_reminders=lambda **kwargs: [reminder]),
    )
    assert [event.summary for event in care_calendar_events(runtime, litter_id, *_window())] == [
        "Herinnering · Temperatuur · Moederhond",
    ]
    mother_storage._data["litters"][litter_id]["mother_id"] = "other"
    assert care_calendar_events(runtime, litter_id, *_window()) == []


async def test_calendar_platform_adds_one_entity_per_litter_and_tracks_new_litters(hass, storage, install_litter):
    litter_id, _ = install_litter()
    entry = MockConfigEntry(domain=DOMAIN)
    entry.runtime_data = PuppyTrackerRuntimeData(storage=storage)
    entry.add_to_hass(hass)
    entities = []
    await async_setup_entry(hass, entry, lambda new: entities.extend(new))
    assert len(entities) == 1
    assert isinstance(entities[0], LitterCareCalendar)
    assert entities[0].unique_id == f"{litter_id}_care_calendar"
    async_dispatcher_send(hass, SIGNAL_NEW_LITTER, "litter-2")
    async_dispatcher_send(hass, SIGNAL_NEW_LITTER, "litter-2")
    assert len(entities) == 2
