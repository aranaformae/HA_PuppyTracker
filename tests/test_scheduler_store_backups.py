"""Portable backup snapshot tests for external scheduler stores."""

from __future__ import annotations

from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.care_programs import (
    AgeBasedCareProgramStore,
    normalize_care_program,
    normalize_care_program_backup_data,
)
from custom_components.puppy_tracker.recurring_reminders import (
    RecurringReminderStore,
    normalize_recurring_reminder_backup_data,
    normalize_reminder,
)


def _care_program() -> dict:
    return normalize_care_program(
        {
            "id": "care-1",
            "revision": 2,
            "litter_id": "litter-1",
            "title": "ENS",
            "record_type": "test",
            "schedule_type": "range",
            "start_age_days": 3,
            "end_age_days": 17,
            "interval_days": 1,
            "time_of_day": "09:00",
            "result_fields": ["result", "score", "note"],
            "created_at": "2026-09-01T08:00:00+02:00",
            "updated_at": "2026-09-01T08:30:00+02:00",
        },
        program_id="care-1",
    )


def _recurring_reminder() -> dict:
    return normalize_reminder(
        {
            "id": "reminder-1",
            "enabled": True,
            "title": "Temperatuur meten",
            "owner_scope": "puppy",
            "owner_id": "puppy-1",
            "litter_id": "litter-1",
            "record_type": "temperature",
            "schedule_mode": "fixed_times",
            "fixed_times": ["08:00", "20:00"],
            "start_at": "2026-09-01T08:00:00+02:00",
            "created_at": "2026-09-01T08:00:00+02:00",
            "updated_at": "2026-09-01T08:30:00+02:00",
        },
        reminder_id="reminder-1",
    )


def test_care_program_backup_preserves_quarantine_and_validates_active_data() -> None:
    program = _care_program()
    raw_future = {"future_schedule": "week_pattern", "payload": [1, 2, 3]}
    normalized = normalize_care_program_backup_data(
        {
            "programs": {"care-1": program},
            "quarantined_programs": {"future-care": raw_future},
        }
    )

    assert normalized["programs"]["care-1"] == program
    assert normalized["quarantined_programs"]["future-care"] == raw_future

    with pytest.raises(ValueError):
        normalize_care_program_backup_data(
            {"programs": {"broken": {"litter_id": "litter-1"}}}
        )

    with pytest.raises(ValueError, match="duplicate"):
        normalize_care_program_backup_data(
            {
                "programs": {"care-1": program},
                "quarantined_programs": {"care-1": raw_future},
            }
        )


def test_recurring_backup_preserves_quarantine_and_validates_active_data() -> None:
    reminder = _recurring_reminder()
    raw_future = {"schedule_mode": "cron", "expression": "0 8 * * *"}
    normalized = normalize_recurring_reminder_backup_data(
        {
            "reminders": {"reminder-1": reminder},
            "quarantined_reminders": {"future-reminder": raw_future},
        }
    )

    assert normalized["reminders"]["reminder-1"] == reminder
    assert normalized["quarantined_reminders"]["future-reminder"] == raw_future

    with pytest.raises(ValueError):
        normalize_recurring_reminder_backup_data(
            {"reminders": {"broken": {"litter_id": "litter-1"}}}
        )

    with pytest.raises(ValueError, match="duplicate"):
        normalize_recurring_reminder_backup_data(
            {
                "reminders": {"reminder-1": reminder},
                "quarantined_reminders": {"reminder-1": raw_future},
            }
        )


async def test_care_program_snapshot_restore_is_deep_and_rolls_back(hass) -> None:
    store = AgeBasedCareProgramStore(hass)
    initial = {
        "programs": {"care-1": _care_program()},
        "quarantined_programs": {"future-care": {"future": True}},
    }
    store._data = deepcopy(initial)

    exported = store.get_backup_data()
    exported["programs"]["care-1"]["title"] = "Changed outside store"
    assert store.get_program("care-1")["title"] == "ENS"

    replacement = {"programs": {}}
    store._store.async_save = AsyncMock(side_effect=[RuntimeError("disk failure"), None])
    with pytest.raises(RuntimeError, match="disk failure"):
        await store.async_restore_backup_data(replacement)

    assert store.get_backup_data() == initial
    assert store._store.async_save.await_count == 2


async def test_recurring_snapshot_restore_is_deep_and_rolls_back(hass) -> None:
    store = RecurringReminderStore(hass)
    initial = {
        "reminders": {"reminder-1": _recurring_reminder()},
        "quarantined_reminders": {"future-reminder": {"future": True}},
    }
    store._data = deepcopy(initial)

    exported = store.get_backup_data()
    exported["reminders"]["reminder-1"]["title"] = "Changed outside store"
    assert store.get_reminder("reminder-1")["title"] == "Temperatuur meten"

    replacement = {"reminders": {}}
    store._store.async_save = AsyncMock(side_effect=[RuntimeError("disk failure"), None])
    with pytest.raises(RuntimeError, match="disk failure"):
        await store.async_restore_backup_data(replacement)

    assert store.get_backup_data() == initial
    assert store._store.async_save.await_count == 2
