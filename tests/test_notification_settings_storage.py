from __future__ import annotations

from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.const import (
    DEFAULT_NOTIFICATION_LEAD_MINUTES,
    DEFAULT_RECURRING_REMINDER_NOTIFICATIONS_ENABLED,
)
from custom_components.puppy_tracker.storage import PuppyTrackerStorage, _empty_data


@pytest.mark.asyncio
async def test_default_settings_include_recurring_notification_toggle(storage) -> None:
    settings = storage.get_settings()

    assert settings["recurring_reminder_notifications_enabled"] is (
        DEFAULT_RECURRING_REMINDER_NOTIFICATIONS_ENABLED
    )
    assert settings["notification_lead_minutes"] == DEFAULT_NOTIFICATION_LEAD_MINUTES


@pytest.mark.asyncio
async def test_update_settings_persists_recurring_notification_toggle(storage) -> None:
    await storage.async_update_settings(
        min_daily_growth_percent=5.0,
        max_hours_between_weighings=24,
        growth_monitoring_days=21,
        notifications_enabled=True,
        recurring_reminder_notifications_enabled=False,
        notify_recovery=True,
        notify_session_complete=True,
        notify_entities=["notify.mobile_app_phone"],
        notification_lead_minutes=45,
    )

    settings = storage.get_settings()
    assert settings["recurring_reminder_notifications_enabled"] is False
    assert settings["notification_lead_minutes"] == 45
    assert settings["notify_entities"] == ["notify.mobile_app_phone"]

    update_entries = [
        entry
        for entry in storage.get_data()["audit_log"]
        if entry.get("action") == "update_settings"
    ]
    assert len(update_entries) == 1
    assert update_entries[0]["details"]["after"][
        "recurring_reminder_notifications_enabled"
    ] is False
    assert update_entries[0]["details"]["after"]["notification_lead_minutes"] == 45


@pytest.mark.asyncio
async def test_load_backfills_recurring_notification_setting_without_schema_bump(hass) -> None:
    stored = deepcopy(_empty_data())
    stored["settings"].pop("recurring_reminder_notifications_enabled")
    stored["settings"].pop("notification_lead_minutes")
    original_schema = stored["schema_version"]

    storage = PuppyTrackerStorage(hass)
    storage._store.async_load = AsyncMock(return_value=stored)
    storage.async_save = AsyncMock()

    await storage.async_load()

    assert storage.get_settings()["recurring_reminder_notifications_enabled"] is (
        DEFAULT_RECURRING_REMINDER_NOTIFICATIONS_ENABLED
    )
    assert storage.get_settings()["notification_lead_minutes"] == DEFAULT_NOTIFICATION_LEAD_MINUTES
    assert storage.get_data()["schema_version"] == original_schema
    storage.async_save.assert_awaited_once()
