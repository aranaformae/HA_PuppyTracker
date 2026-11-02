"""Age-boundary, monitoring and backup behavior for litter weighing phases."""

from copy import deepcopy
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from homeassistant.util import dt as dt_util

from custom_components.puppy_tracker import metrics
from custom_components.puppy_tracker.automation_events import DerivedAutomationEventManager
from custom_components.puppy_tracker.backup import BackupValidationError, build_export_document, prepare_import
from custom_components.puppy_tracker.const import EVENT_PUPPY_ATTENTION_CHANGED
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData
from custom_components.puppy_tracker.storage import _normalize_litter_growth_analysis
from custom_components.puppy_tracker.weighing_schedule import DEFAULT_WEIGHING_PHASES, normalize_weighing_schedule, weighing_interval

NOW = datetime(2026, 11, 3, 12, tzinfo=UTC)


def schedule(enabled=True):
    return {"enabled": enabled, "phases": [{"until_age_days": days, "interval_hours": hours}
                                            for days, hours in DEFAULT_WEIGHING_PHASES]}


@pytest.mark.parametrize("age,expected,phase", [
    (0, 12, 1), (9.999, 12, 1), (10, 24, 2), (27.999, 24, 2),
    (28, 48, 3), (41.999, 48, 3), (42, 72, 4), (52.499, 72, 4), (52.5, None, None), (60, None, None),
])
def test_exact_age_boundaries_include_the_half_day(age, expected, phase):
    plan = weighing_interval({"weighing_schedule": schedule(), "max_hours_between_weighings": 24},
                            NOW - timedelta(days=age), NOW)
    assert plan["max_hours_between_weighings"] == expected
    assert plan["weighing_schedule_phase"] == phase
    assert plan["weighing_schedule_finished"] is (expected is None)


@pytest.mark.parametrize("age,hours", [(5, 12), (14, 24), (35, 48), (50, 72)])
@pytest.mark.parametrize("elapsed_offset,is_due", [(-0.01, False), (0, True), (0.01, True)])
def test_canonical_status_uses_current_phase_interval(storage, install_litter, make_measurement, monkeypatch,
                                                    age, hours, elapsed_offset, is_due):
    monkeypatch.setattr(dt_util, "now", lambda: NOW)
    litter_id, puppy_id = install_litter(
        puppy_overrides={"birth_time": (NOW - timedelta(days=age)).isoformat()},
        litter_overrides={"growth_analysis": {"weighing_schedule": schedule()}},
        measurements=[make_measurement("latest", 500, (NOW - timedelta(hours=hours + elapsed_offset)).isoformat())],
    )
    status = metrics.calculate_puppy_status(storage, litter_id, puppy_id)
    assert (status["status_code"] == "weigh_due") is is_due
    assert status["max_hours_between_weighings"] == hours
    assert metrics.calculate_puppy_metrics(storage, litter_id, puppy_id)["max_hours_between_weighings"] == hours


@pytest.mark.parametrize("with_measurement", [True, False])
def test_after_end_no_planned_or_missing_weighing_alert(storage, install_litter, make_measurement, monkeypatch, with_measurement):
    monkeypatch.setattr(dt_util, "now", lambda: NOW)
    litter_id, puppy_id = install_litter(puppy_overrides={"birth_time": (NOW - timedelta(days=52.5)).isoformat()},
        litter_overrides={"growth_analysis": {"weighing_schedule": schedule()}},
        measurements=[make_measurement("old", 500, (NOW - timedelta(days=5)).isoformat())] if with_measurement else [])
    status = metrics.calculate_puppy_status(storage, litter_id, puppy_id)
    assert status["weighing_schedule_finished"] is True
    assert status["status_code"] == "ok" and not status["needs_attention"]


def test_stopping_planned_weighing_preserves_actual_weight_loss(storage, install_litter, make_measurement, monkeypatch):
    monkeypatch.setattr(dt_util, "now", lambda: NOW)
    litter_id, puppy_id = install_litter(puppy_overrides={"birth_time": (NOW - timedelta(days=54)).isoformat()},
        litter_overrides={"growth_analysis": {"weighing_schedule": schedule()}},
        measurements=[make_measurement("a", 600, (NOW - timedelta(days=5)).isoformat()),
                      make_measurement("b", 500, (NOW - timedelta(days=4)).isoformat())])
    status = metrics.calculate_puppy_status(storage, litter_id, puppy_id)
    assert status["weighing_schedule_finished"] is True
    assert status["status_code"] == "weight_loss" and status["needs_attention"]


@pytest.mark.parametrize("value,birth", [(None, NOW), (schedule(False), NOW), (schedule(), None), ({"invalid": True}, NOW)])
def test_old_disabled_unknown_birth_and_invalid_profiles_use_fixed_fallback(value, birth):
    plan = weighing_interval({"max_hours_between_weighings": 18, "weighing_schedule": value}, birth, NOW)
    assert plan["weighing_schedule_mode"] == "fixed"
    assert plan["max_hours_between_weighings"] == 18
    assert not plan["weighing_schedule_finished"]


def test_custom_litter_schedule_is_independent_and_survives_normalization():
    first, second = schedule(), schedule()
    first["phases"][0]["interval_hours"] = 8
    first["phases"][3]["until_age_days"] = 56
    normalized = _normalize_litter_growth_analysis({"weighing_schedule": first})
    assert normalized["weighing_schedule"] == first
    assert second == schedule()
    assert normalize_weighing_schedule(first) is not first


@pytest.mark.parametrize("field,value", [("until_age_days", 0), ("until_age_days", 57),
    ("until_age_days", float("nan")), ("interval_hours", 0), ("interval_hours", 169),
    ("interval_hours", float("inf")), ("interval_hours", True)])
def test_invalid_schedule_values_are_rejected(field, value):
    profile = schedule()
    profile["phases"][0][field] = value
    with pytest.raises(ValueError):
        normalize_weighing_schedule(profile)


def test_decreasing_ages_and_wrong_phase_count_are_rejected():
    profile = schedule()
    profile["phases"][1]["until_age_days"] = 8
    with pytest.raises(ValueError):
        normalize_weighing_schedule(profile)
    profile["phases"].pop()
    with pytest.raises(ValueError):
        normalize_weighing_schedule(profile)


def test_age_phase_uses_elapsed_hours_across_dst():
    zone = ZoneInfo("Europe/Amsterdam")
    birth = datetime(2026, 10, 15, 12, tzinfo=zone)
    current = (birth.astimezone(UTC) + timedelta(days=10)).astimezone(zone)
    plan = weighing_interval({"weighing_schedule": schedule(), "max_hours_between_weighings": 24}, birth, current)
    assert plan["weighing_schedule_phase"] == 2


async def test_end_of_plan_clears_existing_weighing_attention_event(hass, storage, install_litter, make_measurement, monkeypatch):
    clock = [NOW]
    monkeypatch.setattr(dt_util, "now", lambda: clock[0])
    install_litter(puppy_overrides={"birth_time": (NOW - timedelta(days=52)).isoformat()},
        litter_overrides={"growth_analysis": {"weighing_schedule": schedule()}},
        measurements=[make_measurement("old", 500, (NOW - timedelta(days=4)).isoformat())])
    manager = DerivedAutomationEventManager(hass, PuppyTrackerRuntimeData(storage=storage))
    events = []
    unsubscribe = hass.bus.async_listen(EVENT_PUPPY_ATTENTION_CHANGED, lambda event: events.append(event.data))
    try:
        await manager.async_check()
        clock[0] += timedelta(hours=12)
        await manager.async_check()
        await hass.async_block_till_done()
        assert len(events) == 1 and events[0]["transition"] == "cleared"
        assert events[0]["previous_reason_codes"] == ["weigh_due"]
    finally:
        unsubscribe()
        await manager.async_stop()


def test_backup_preserves_the_schedule_and_rejects_invalid_profiles(storage, install_litter):
    litter_id, _ = install_litter(litter_overrides={"growth_analysis": {"weighing_schedule": schedule()}})
    document = build_export_document(storage, scope="full", care_reminder_settings={
        "lead_days": 7, "categories": {"vaccination": True, "deworming": True}},
        scheduler_data={"version": 1, "care_programs": {"programs": {}}, "recurring_reminders": {"reminders": {}}})
    plan = prepare_import(storage, document, mode="replace_all")
    assert plan["candidate"]["litters"][litter_id]["growth_analysis"]["weighing_schedule"] == schedule()
    invalid = deepcopy(document)
    invalid["data"]["litters"][litter_id]["growth_analysis"]["weighing_schedule"]["phases"][1]["until_age_days"] = 1
    with pytest.raises(BackupValidationError):
        prepare_import(storage, invalid, mode="replace_all")
