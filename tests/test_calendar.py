"""Calendar projections use pending care, not historical dossier content."""

from copy import deepcopy
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

from homeassistant.helpers.dispatcher import async_dispatcher_send
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.calendar import (
    LitterCareCalendar, async_setup_entry, care_calendar_events,
)
from custom_components.puppy_tracker.care_occurrences import derive_puppy_care_occurrences
from custom_components.puppy_tracker.care_programs import normalize_care_program
from custom_components.puppy_tracker.const import DOMAIN, SIGNAL_NEW_LITTER
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
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
