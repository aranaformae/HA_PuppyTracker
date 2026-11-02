"""Executable transition, privacy and committed-state tests for public events."""

import asyncio
from copy import deepcopy
from datetime import UTC, datetime, timedelta
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock
from zoneinfo import ZoneInfo

import pytest
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import dt as dt_util

from custom_components.puppy_tracker.automation_events import DerivedAutomationEventManager
from custom_components.puppy_tracker.care_occurrences import derive_litter_care_occurrences
from custom_components.puppy_tracker.care_programs import AgeBasedCareProgramStore
from custom_components.puppy_tracker.const import EVENT_CARE_DUE_CHANGED, EVENT_PUPPY_ATTENTION_CHANGED, SIGNAL_DASHBOARD_UPDATE
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
from custom_components.puppy_tracker.recurring_reminders import RecurringReminderStore
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData


@pytest.fixture
async def env(hass, storage, install_litter, make_measurement, monkeypatch):
    previous_zone = dt_util.get_default_time_zone()
    zone = ZoneInfo("Europe/Amsterdam")
    dt_util.set_default_time_zone(zone)
    clock = [datetime(2026, 8, 31, 12, tzinfo=zone)]
    monkeypatch.setattr(dt_util, "now", lambda: dt_util.as_local(clock[0]))
    litter_id, puppy_id = install_litter(measurements=[
        make_measurement("previous", 440, (clock[0] - timedelta(days=1)).isoformat()),
        make_measurement("latest", 500, clock[0].isoformat()),
    ])
    main = MotherScopeStorage(hass)
    main._data = deepcopy(storage.get_data())
    main.async_save = AsyncMock()
    programs, reminders = AgeBasedCareProgramStore(hass), RecurringReminderStore(hass)
    programs._store.async_save = AsyncMock()
    reminders._store.async_save = AsyncMock()
    runtime = PuppyTrackerRuntimeData(storage=main, care_programs=programs, recurring_reminders=reminders)
    manager = DerivedAutomationEventManager(hass, runtime)
    events = []
    unsubs = [hass.bus.async_listen(name, lambda event: events.append((event.event_type, dict(event.data))))
              for name in (EVENT_CARE_DUE_CHANGED, EVENT_PUPPY_ATTENTION_CHANGED)]

    async def check():
        await environment.manager.async_check()
        await hass.async_block_till_done()

    async def program(**extra):
        return await programs.async_create({"litter_id": litter_id, "title": "PRIVATE PROGRAM",
            "schedule_type": "once", "record_type": "test", "start_age_days": 3,
            "time_of_day": "13:00", "instructions": "PRIVATE INSTRUCTIONS", **extra})

    async def reminder(**extra):
        return await reminders.async_create({"litter_id": litter_id, "owner_scope": "puppy",
            "owner_id": puppy_id, "title": "PRIVATE REMINDER", "record_type": "note",
            "schedule_mode": "once", "due_at": (clock[0] + timedelta(hours=1)).isoformat(), **extra})

    environment = SimpleNamespace(hass=hass, storage=main, runtime=runtime, manager=manager, clock=clock,
                                  events=events, check=check, program=program, reminder=reminder,
                                  litter_id=litter_id, puppy_id=puppy_id)
    yield environment
    await environment.manager.async_stop()
    for unsub in unsubs:
        unsub()
    dt_util.set_default_time_zone(previous_zone)


def care_events(env):
    return [data for name, data in env.events if name == EVENT_CARE_DUE_CHANGED]


def attention_events(env):
    return [data for name, data in env.events if name == EVENT_PUPPY_ATTENTION_CHANGED]


async def test_program_due_complete_undo_and_reason_changes_are_deduplicated(env):
    program_id = await env.program()
    await env.check()
    assert env.events == []
    env.clock[0] += timedelta(hours=1)
    await env.check()
    await env.check()
    assert [item["transition"] for item in care_events(env)] == ["due"]
    occurrence_id = care_events(env)[0]["occurrence_id"]
    assert care_events(env)[0]["program_id"] == program_id
    assert attention_events(env)[0]["reason_codes"] == ["care_due"]
    env.storage._data["litters"][env.litter_id]["puppies"][env.puppy_id]["measurements"][-1]["weight"] = 400
    await env.check()
    assert attention_events(env)[-1]["transition"] == "changed"
    assert attention_events(env)[-1]["reason_codes"] == ["care_due", "weight_loss"]
    record_id = await env.storage.async_add_record(env.litter_id, puppy_id=env.puppy_id, record_type="test",
        occurred_at=env.clock[0].isoformat(), note="PRIVATE NOTE", data={"care_occurrence_id": occurrence_id, "care_status": "completed"})
    await env.check()
    assert care_events(env)[-1]["transition"] == "cleared"
    assert attention_events(env)[-1]["reason_codes"] == ["weight_loss"]
    await env.storage.async_delete_record(env.litter_id, record_id, puppy_id=env.puppy_id)
    await env.check()
    assert care_events(env)[-1]["transition"] == "due"
    encoded = json.dumps(env.events)
    assert "PRIVATE" not in encoded and "Groen" not in encoded and "Luna" not in encoded
    assert set(care_events(env)[0]) == {"source", "litter_id", "owner_scope", "owner_id", "puppy_id",
                                        "due_at", "program_id", "occurrence_id", "transition", "timestamp"}


async def test_counts_for_attention_never_hides_weight_concerns(env):
    await env.program(counts_for_attention=False, notifications_enabled=False)
    env.storage._data["settings"]["notifications_enabled"] = False
    await env.check()
    env.clock[0] += timedelta(hours=1)
    await env.check()
    assert len(care_events(env)) == 1 and attention_events(env) == []
    env.storage._data["litters"][env.litter_id]["puppies"][env.puppy_id]["measurements"][-1]["weight"] = 400
    await env.check()
    assert attention_events(env)[-1]["reason_codes"] == ["weight_loss"]


@pytest.mark.parametrize("operation", ["disable", "delete", "archive_puppy", "archive_litter", "reschedule"])
async def test_removal_disable_archive_and_reschedule_clear_once(env, operation):
    program_id = await env.program()
    await env.check()
    env.clock[0] += timedelta(hours=1)
    await env.check()
    if operation == "disable":
        await env.runtime.care_programs.async_update(program_id, {"enabled": False})
    elif operation == "delete":
        await env.runtime.care_programs.async_delete(program_id)
    elif operation == "reschedule":
        await env.runtime.care_programs.async_update(program_id, {"time_of_day": "14:00"})
    elif operation == "archive_puppy":
        await env.storage.async_set_puppy_active(env.litter_id, env.puppy_id, False)
    else:
        await env.storage.async_set_litter_active(env.litter_id, False)
    await env.check()
    await env.check()
    assert [item["transition"] for item in care_events(env)] == ["due", "cleared"]
    assert attention_events(env)[-1]["transition"] == "cleared"


async def test_reminder_due_time_ignores_notification_lead_and_postpone_clears(env):
    reminder_id = await env.reminder(notification_lead_minutes=120)
    await env.check()
    env.clock[0] += timedelta(minutes=59)
    await env.check()
    assert care_events(env) == []
    env.clock[0] += timedelta(minutes=1)
    await env.check()
    assert care_events(env)[0]["reminder_id"] == reminder_id
    due_at = care_events(env)[0]["due_at"]
    item = env.runtime.recurring_reminders.get_reminder(reminder_id)
    await env.runtime.recurring_reminders.async_postpone(env.storage, reminder_id, due_at=due_at,
        until=(env.clock[0] + timedelta(minutes=30)).isoformat(), expected_updated_at=item["updated_at"])
    await env.check()
    assert care_events(env)[-1]["transition"] == "cleared"
    env.clock[0] += timedelta(minutes=30)
    await env.check()
    assert care_events(env)[-1]["transition"] == "due"
    await env.runtime.recurring_reminders.async_delete(reminder_id)
    await env.check()
    assert care_events(env)[-1]["transition"] == "cleared"


async def test_reminder_completion_and_undo_derive_from_records_without_scheduler_writes(env):
    reminder_id = await env.reminder()
    await env.check()
    env.clock[0] += timedelta(hours=1)
    await env.check()
    before = env.runtime.recurring_reminders.get_backup_data()
    env.runtime.recurring_reminders._store.async_save.reset_mock()
    record_id = await env.storage.async_add_record(env.litter_id, puppy_id=env.puppy_id, record_type="note",
        occurred_at=env.clock[0].isoformat(), data={"recurring_reminder_id": reminder_id, "recurring_due_at": env.clock[0].isoformat()})
    await env.check()
    assert care_events(env)[-1]["transition"] == "cleared"
    await env.storage.async_delete_record(env.litter_id, record_id, puppy_id=env.puppy_id)
    await env.check()
    assert care_events(env)[-1]["transition"] == "due"
    assert env.runtime.recurring_reminders.get_backup_data() == before
    env.runtime.recurring_reminders._store.async_save.assert_not_awaited()


async def test_calendar_followup_completion_and_undo(env):
    await env.check()
    source = await env.storage.async_add_record(env.litter_id, puppy_id=env.puppy_id, record_type="deworming",
        data={"product": "PRIVATE MEDICINE", "next_due_date": "2026-08-31"})
    await env.check()
    assert care_events(env)[-1]["record_id"] == source
    assert attention_events(env)[-1]["reason_codes"] == ["dossier_followup_due"]
    result = await env.storage.async_add_record(env.litter_id, puppy_id=env.puppy_id, record_type="deworming",
        data={"product": "PRIVATE MEDICINE", "followup_record_id": source, "followup_due_date": "2026-08-31"})
    await env.check()
    assert care_events(env)[-1]["transition"] == "cleared"
    await env.storage.async_delete_record(env.litter_id, result, puppy_id=env.puppy_id)
    await env.check()
    assert care_events(env)[-1]["transition"] == "due"


async def test_startup_restart_restore_and_clock_rollback_silently_rebaseline(env):
    await env.program(time_of_day=None)
    await env.check()
    await env.check()
    assert env.events == []
    await env.manager.async_stop()
    env.manager = DerivedAutomationEventManager(env.hass, env.runtime)
    await env.check()
    assert env.events == []
    async with env.storage.mutations.restore():
        env.runtime.care_programs._data["programs"].clear()
    await env.check()
    assert env.events == []
    await env.program(time_of_day=None)
    await env.check()
    assert care_events(env)[-1]["transition"] == "due"
    env.events.clear()
    env.clock[0] -= timedelta(days=1)
    await env.check()
    assert env.events == []


async def test_failed_write_cannot_emit_events_from_temporary_state(env):
    await env.manager.async_start()
    await env.hass.async_block_till_done()
    entered, release = asyncio.Event(), asyncio.Event()

    async def failed_save():
        entered.set()
        await release.wait()
        raise OSError("disk full")

    env.storage.async_save = failed_save
    task = asyncio.create_task(env.storage.async_add_record(env.litter_id, puppy_id=env.puppy_id,
        record_type="deworming", data={"product": "PRIVATE", "next_due_date": "2026-08-31"}))
    await entered.wait()
    async_dispatcher_send(env.hass, SIGNAL_DASHBOARD_UPDATE)
    await asyncio.sleep(0)
    assert env.events == []
    release.set()
    with pytest.raises(OSError):
        await task
    await env.hass.async_block_till_done()
    assert env.events == []


async def test_stop_unsubscribes_and_does_not_emit_clears(env):
    await env.manager.async_start()
    await env.program(time_of_day=None)
    async_dispatcher_send(env.hass, SIGNAL_DASHBOARD_UPDATE)
    await env.hass.async_block_till_done()
    assert care_events(env)[-1]["transition"] == "due"
    program_id = care_events(env)[-1]["program_id"]
    await env.manager.async_stop()
    env.events.clear()
    await env.runtime.care_programs.async_delete(program_id)
    async_dispatcher_send(env.hass, SIGNAL_DASHBOARD_UPDATE)
    await env.hass.async_block_till_done()
    assert env.events == []


@pytest.mark.parametrize("scope", ["litter", "mother", "puppy"])
async def test_care_owner_identity_and_other_litter_history_stay_separate(env, scope):
    mother_id = "mother-1"
    env.storage._data.setdefault("mothers", {})[mother_id] = {"id": mother_id, "name": "PRIVATE MOTHER", "records": []}
    env.storage._data["litters"][env.litter_id]["mother_id"] = mother_id
    env.storage._data["litters"]["other"] = {"id": "other", "mother_id": mother_id, "active": True, "puppies": {}}
    owner_id = {"litter": env.litter_id, "mother": mother_id, "puppy": env.puppy_id}[scope]
    await env.reminder(owner_scope=scope, owner_id=owner_id)
    await env.check()
    # A mother record from another litter must not consume this reminder.
    await env.storage.async_add_record("other", mother_id=mother_id, record_type="note", occurred_at=env.clock[0].isoformat())
    env.clock[0] += timedelta(hours=1)
    await env.check()
    item = care_events(env)[-1]
    assert item["owner_scope"] == scope and item["owner_id"] == owner_id
    assert item["puppy_id"] == (env.puppy_id if scope == "puppy" else None)
    assert item["litter_id"] == env.litter_id


@pytest.mark.parametrize("schedule_mode", ["interval", "fixed_times"])
async def test_repeating_reminders_move_to_the_next_moment_once(env, schedule_mode):
    start = env.clock[0] + timedelta(hours=1)
    reminder_id = await env.reminder(schedule_mode=schedule_mode, start_at=(env.clock[0] if schedule_mode == "interval" else start).isoformat(),
        interval_minutes=60, fixed_times=["13:00", "14:00"])
    await env.check()
    env.clock[0] = start
    await env.check()
    await env.storage.async_add_record(env.litter_id, puppy_id=env.puppy_id, record_type="note",
        occurred_at=start.isoformat(), data={"recurring_reminder_id": reminder_id, "recurring_due_at": start.isoformat()})
    await env.check()
    await env.check()
    assert [item["transition"] for item in care_events(env)] == ["due", "cleared"]
    env.clock[0] += timedelta(hours=1)
    await env.check()
    await env.check()
    assert [item["transition"] for item in care_events(env)] == ["due", "cleared", "due"]
    assert care_events(env)[0]["due_at"] != care_events(env)[-1]["due_at"]


async def test_age_only_care_becomes_due_at_ha_midnight(env):
    await env.program(start_age_days=4, time_of_day=None)
    env.clock[0] = env.clock[0].replace(hour=23, minute=59)
    await env.check()
    env.clock[0] += timedelta(minutes=1)
    await env.check()
    assert care_events(env)[-1]["due_at"] == "2026-08-31T22:00:00+00:00"
    await env.check()
    assert len(care_events(env)) == 1


async def test_dst_fold_does_not_mistake_elapsed_time_for_a_clock_rollback(env):
    zone = ZoneInfo("Europe/Amsterdam")
    env.clock[0] = datetime(2026, 10, 25, 2, 20, tzinfo=zone, fold=0)
    reminder_id = await env.reminder(schedule_mode="fixed_times", fixed_times=["02:30"],
        start_at="2026-10-25T00:00:00+02:00")
    await env.check()
    env.clock[0] = datetime(2026, 10, 25, 2, 40, tzinfo=zone, fold=0)
    await env.check()
    assert care_events(env)[-1]["due_at"] == "2026-10-25T00:30:00+00:00"
    env.clock[0] = datetime(2026, 10, 25, 2, 10, tzinfo=zone, fold=1)
    await env.runtime.recurring_reminders.async_update(reminder_id, {"enabled": False})
    await env.check()
    assert [item["transition"] for item in care_events(env)] == ["due", "cleared"]


async def test_dst_gap_resolves_fixed_reminder_to_a_real_instant(env):
    zone = ZoneInfo("Europe/Amsterdam")
    env.clock[0] = datetime(2026, 3, 29, 1, 50, tzinfo=zone)
    await env.reminder(schedule_mode="fixed_times", fixed_times=["02:30"], start_at="2026-03-29T00:00:00+01:00")
    await env.check()
    env.clock[0] = datetime(2026, 3, 29, 3, 29, tzinfo=zone)
    await env.check()
    assert care_events(env) == []
    env.clock[0] += timedelta(minutes=1)
    await env.check()
    assert care_events(env)[-1]["due_at"] == "2026-03-29T01:30:00+00:00"


async def test_failed_restore_keeps_the_previous_event_baseline(env):
    program_id = await env.program()
    await env.check()
    before = env.runtime.care_programs.get_backup_data()
    with pytest.raises(OSError):
        async with env.storage.mutations.restore():
            try:
                env.runtime.care_programs._data["programs"].clear()
                raise OSError("restore failed")
            finally:
                env.runtime.care_programs._data = deepcopy(before)
    env.clock[0] += timedelta(hours=1)
    await env.check()
    assert care_events(env)[-1]["program_id"] == program_id
    assert care_events(env)[-1]["transition"] == "due"


async def test_update_during_pending_snapshot_is_rechecked_after_commit(env):
    await env.manager.async_start()
    await env.hass.async_block_till_done()
    entered, release = asyncio.Event(), asyncio.Event()

    async def write():
        async with env.storage.mutations.operation():
            await env.program(time_of_day=None)
            entered.set()
            await release.wait()

    task = asyncio.create_task(write())
    await entered.wait()
    for _ in range(5):
        async_dispatcher_send(env.hass, SIGNAL_DASHBOARD_UPDATE)
    await asyncio.sleep(0)
    assert env.events == []
    release.set()
    await task
    await env.hass.async_block_till_done()
    assert len(care_events(env)) == 1
    assert care_events(env)[0]["transition"] == "due"


async def test_due_time_is_observed_by_timer_without_any_dashboard_signal(env, freezer):
    from pytest_homeassistant_custom_component.common import async_fire_time_changed

    await env.program()
    env.clock[0] = env.clock[0].replace(hour=12, minute=59)
    freezer.move_to(env.clock[0])
    await env.manager.async_start()
    await env.hass.async_block_till_done()
    assert env.events == []
    env.clock[0] += timedelta(minutes=1)
    freezer.move_to(env.clock[0])
    async_fire_time_changed(env.hass, dt_util.utcnow())
    await env.hass.async_block_till_done()
    assert [item["transition"] for item in care_events(env)] == ["due"]


async def test_event_subscribers_cannot_mutate_the_deduplication_baseline(env):
    unsubscribe = env.hass.bus.async_listen(EVENT_PUPPY_ATTENTION_CHANGED,
        lambda event: event.data["reason_codes"].append("external-consumer"))
    try:
        await env.check()
        await env.program(time_of_day=None)
        await env.check()
        await env.check()
        assert len(attention_events(env)) == 1
    finally:
        unsubscribe()
