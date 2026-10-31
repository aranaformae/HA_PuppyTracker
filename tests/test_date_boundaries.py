"""Calendar days and elapsed minutes must remain distinct across DST."""
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from types import SimpleNamespace

import pytest
from homeassistant.util import dt as dt_util
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.components.calendar import CalendarEvent
from pytest_homeassistant_custom_component.common import async_fire_time_changed

from custom_components.puppy_tracker.calendar import care_calendar_events, _overlaps
from custom_components.puppy_tracker.care_occurrences import derive_puppy_care_occurrences
from custom_components.puppy_tracker.care_status import care_occurrence_status, matching_care_result_record
from custom_components.puppy_tracker.recurring_reminders import next_due_at, reminder_status
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData
from custom_components.puppy_tracker.day_rollover import async_setup_day_rollover
from custom_components.puppy_tracker.const import SIGNAL_DASHBOARD_UPDATE
from custom_components.puppy_tracker.pdf_export import _format_date


@pytest.fixture
def local_zone(hass):
    previous = dt_util.get_default_time_zone()
    def configure(name):
        zone = ZoneInfo(name)
        dt_util.set_default_time_zone(zone)
        return zone
    yield configure
    dt_util.set_default_time_zone(previous)


@pytest.mark.parametrize(("now", "start", "minutes"), [
    (datetime(2026, 3, 29, 1, tzinfo=ZoneInfo("Europe/Amsterdam")), "2026-03-29T00:00:00+01:00", 360),
    (datetime(2026, 10, 25, 1, tzinfo=ZoneInfo("Europe/Amsterdam")), "2026-10-25T00:00:00+02:00", 480),
])
def test_fixed_reminder_minutes_are_elapsed_time(now, start, minutes):
    reminder = {"enabled": True, "schedule_mode": "fixed_times", "fixed_times": ["08:00"], "start_at": start}
    assert reminder_status(reminder, now=now)["minutes_until_due"] == minutes


def test_autumn_fold_does_not_offer_a_second_execution():
    zone = ZoneInfo("Europe/Amsterdam")
    now = datetime(2026, 10, 25, 2, 15, fold=1, tzinfo=zone)
    reminder = {"enabled": True, "schedule_mode": "fixed_times", "fixed_times": ["02:30"], "start_at": "2026-10-25T00:00:00+02:00"}
    assert reminder_status(reminder, now=now)["minutes_until_due"] == -45
    reminder["last_completed_due_at"] = "2026-10-25T02:30:00+02:00"
    assert next_due_at(reminder, now=now).date().isoformat() == "2026-10-26"


def test_spring_gap_resolves_forward_and_sorts_by_real_instant():
    now = datetime(2026, 3, 29, 0, tzinfo=ZoneInfo("Europe/Amsterdam"))
    reminder = {"enabled": True, "schedule_mode": "fixed_times", "fixed_times": ["02:30"], "start_at": now.isoformat()}
    assert next_due_at(reminder, now=now).isoformat() == "2026-03-29T03:30:00+02:00"
    reminder["fixed_times"].append("03:00")
    assert next_due_at(reminder, now=now).isoformat() == "2026-03-29T03:00:00+02:00"


@pytest.mark.parametrize("month,day", [(3, 29), (10, 25)])
def test_interval_reminder_is_real_minutes_across_dst(month, day):
    now = datetime(2026, month, day, 1, 30, tzinfo=ZoneInfo("Europe/Amsterdam"))
    reminder = {"enabled": True, "schedule_mode": "interval", "interval_minutes": 120}
    assert next_due_at(reminder, now=now).timestamp() - now.timestamp() == 7200


def test_age_based_clock_resolves_spring_gap(local_zone):
    local_zone("Europe/Amsterdam")
    program = {"id": "ens", "litter_id": "l1", "schedule_type": "once", "start_age_days": 0, "time_of_day": "02:30"}
    item = derive_puppy_care_occurrences(program, {"id": "p1", "birth_time": "2026-03-29T00:30:00+01:00"})[0]
    assert item["scheduled_at"] == "2026-03-29T03:30:00+02:00"


def test_care_day_uses_ha_zone_after_offset_change(local_zone):
    zone = local_zone("Europe/Amsterdam")
    occurrence = {"id": "care", "scheduled_at": "2026-03-28T09:00:00+01:00", "time_of_day": "09:00"}
    item = care_occurrence_status(occurrence, [], now=datetime(2026, 3, 30, 0, 30, tzinfo=zone))
    assert item["days_until_due"] == -2
    assert item["status"] == "overdue"


def test_unclocked_care_keeps_elapsed_age_but_groups_by_local_day(local_zone):
    local_zone("Europe/Amsterdam")
    program = {"id": "ens", "litter_id": "l1", "schedule_type": "once", "start_age_days": 3}
    item = derive_puppy_care_occurrences(program, {"id": "p1", "birth_time": "2026-09-01T23:30:00+00:00"})[0]
    assert item["scheduled_at"] == "2026-09-04T23:30:00+00:00"
    assert item["scheduled_date"] == "2026-09-05"


def test_care_results_sort_by_instant_across_fold():
    records = [{"id": key, "occurred_at": stamp, "data": {"care_occurrence_id": "care"}} for key, stamp in [
        ("later", "2026-10-25T02:10:00+01:00"), ("earlier", "2026-10-25T02:50:00+02:00")]]
    assert matching_care_result_record({"id": "care"}, records)["id"] == "later"


def test_pdf_birth_date_uses_local_day_but_preserves_date_only_fields(local_zone):
    local_zone("Europe/Amsterdam")
    assert _format_date("2026-10-24T23:30:00+00:00") == "25-10-2026"
    assert _format_date("2026-10-24") == "24-10-2026"


def test_calendar_overlap_uses_instants_in_autumn_fold(local_zone):
    zone = local_zone("Europe/Amsterdam")
    event = CalendarEvent(start=datetime(2026, 10, 25, 2, 45, tzinfo=zone),
        end=datetime(2026, 10, 25, 3, 15, tzinfo=zone), summary="Care")
    assert _overlaps(event, datetime(2026, 10, 25, 2, 50, tzinfo=zone),
        datetime(2026, 10, 25, 2, 10, fold=1, tzinfo=zone))


async def test_calendar_utc_query_includes_previous_local_day(storage, install_litter, local_zone):
    local_zone("America/Los_Angeles")
    litter_id, puppy_id = install_litter()
    await storage.async_add_record(litter_id, puppy_id=puppy_id, record_type="deworming", data={"next_due_date": "2026-09-30"})
    events = care_calendar_events(PuppyTrackerRuntimeData(storage=storage), litter_id,
        datetime(2026, 10, 1, 4, tzinfo=timezone.utc), datetime(2026, 10, 1, 6, tzinfo=timezone.utc))
    assert len(events) == 1
    assert events[0].all_day


@pytest.mark.parametrize(("before", "first", "second", "after"), [
    ("2026-03-28T22:59:50Z", "2026-03-28T23:00:00Z", "2026-03-29T22:00:00Z", "2026-03-30T22:00:00Z"),
    ("2026-10-24T21:59:50Z", "2026-10-24T22:00:00Z", "2026-10-25T23:00:00Z", "2026-10-26T23:00:00Z"),
])
async def test_daily_refresh_uses_local_midnight_on_23_and_25_hour_days(hass, freezer, local_zone, before, first, second, after):
    local_zone("Europe/Amsterdam")
    freezer.move_to(before)
    cleanups, updates = [], []
    unsubscribe = async_dispatcher_connect(hass, SIGNAL_DASHBOARD_UPDATE, lambda: updates.append(dt_util.now().date()))
    async_setup_day_rollover(hass, SimpleNamespace(async_on_unload=cleanups.append))
    for moment in (first, second):
        freezer.move_to(moment)
        async_fire_time_changed(hass, dt_util.utcnow())
        await hass.async_block_till_done()
    assert len(updates) == 2
    assert (updates[1] - updates[0]).days == 1
    cleanups[0]()
    freezer.move_to(after)
    async_fire_time_changed(hass, dt_util.utcnow())
    await hass.async_block_till_done()
    assert len(updates) == 2
    unsubscribe()
