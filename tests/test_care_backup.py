"""Tests for portable care reminder backup preferences."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.care_reminders import (
    CareReminderStore,
    _default_data,
)


def _store(hass) -> CareReminderStore:
    store = CareReminderStore(hass)
    store._data = _default_data()
    store._store.async_save = AsyncMock()
    return store


async def test_care_backup_settings_exclude_delivery_state(hass) -> None:
    store = _store(hass)
    store._data["lead_days"] = 3
    store._data["categories"]["deworming"] = False
    store._data["states"] = {"record-1": {"state": "upcoming:3"}}

    assert store.get_backup_settings() == {
        "lead_days": 3,
        "categories": {
            "vaccination": True,
            "deworming": False,
        },
    }


async def test_restore_care_backup_settings_resets_delivery_state(hass) -> None:
    store = _store(hass)
    store._data["states"] = {"old-record": {"state": "overdue"}}

    await store.async_restore_backup_settings(
        {
            "lead_days": 10,
            "categories": {
                "vaccination": False,
                "deworming": True,
            },
        }
    )

    assert store.get_lead_days() == 10
    assert store.get_categories() == {
        "vaccination": False,
        "deworming": True,
    }
    assert store.get_states() == {}
    store._store.async_save.assert_awaited_once()


async def test_restore_care_backup_settings_rolls_back_on_save_failure(hass) -> None:
    store = _store(hass)
    before = store.get_backup_settings()
    store._store.async_save = AsyncMock(side_effect=[RuntimeError("disk failure"), None])

    with pytest.raises(RuntimeError, match="disk failure"):
        await store.async_restore_backup_settings(
            {
                "lead_days": 1,
                "categories": {
                    "vaccination": False,
                    "deworming": False,
                },
            }
        )

    assert store.get_backup_settings() == before
