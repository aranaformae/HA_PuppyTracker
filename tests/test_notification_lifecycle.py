"""Notification lifecycle and scheduling regression tests."""

from __future__ import annotations

import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock
from unittest.mock import Mock

from custom_components.puppy_tracker.notifications import PuppyNotificationManager
from custom_components.puppy_tracker.recurring_notifications import (
    RecurringReminderNotificationManager,
)
from custom_components.puppy_tracker.recurring_reminders import RecurringReminderStore
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData


async def test_reopening_completed_weighing_clears_completion_once(hass, storage, install_litter, monkeypatch):
    litter_id, puppy_id = install_litter()
    runtime = PuppyTrackerRuntimeData(storage=storage)
    manager = PuppyNotificationManager(hass, MagicMock(), storage, runtime)
    runtime.weighing_session.update(status="completed", litter_id=litter_id, puppy_ids=[puppy_id],
                                    weighed_puppy_ids=[puppy_id], completed_at="2026-10-23T08:00:00+00:00")
    manager._async_send_notify_entities = AsyncMock()
    dismiss = Mock()
    clear = AsyncMock()
    monkeypatch.setattr("custom_components.puppy_tracker.notifications.async_create_persistent_notification", Mock())
    monkeypatch.setattr("custom_components.puppy_tracker.notifications.async_dismiss_persistent_notification", dismiss)
    monkeypatch.setattr("custom_components.puppy_tracker.notifications.async_clear_notify_entities", clear)
    await manager._process_completed_session(["notify.phone"])
    assert manager._async_send_notify_entities.call_args.kwargs["notification_tag"] == manager._session_notification_id(litter_id)
    runtime.weighing_session.update(status="active", completed_at=None)
    await manager._process_completed_session(["notify.phone"])
    await manager._process_completed_session(["notify.phone"])
    dismiss.assert_called_once_with(hass, manager._session_notification_id(litter_id))
    clear.assert_awaited_once_with(hass, ["notify.phone"], manager._session_notification_id(litter_id))
    assert manager._last_session_completed_at is None


async def test_recovered_completion_does_not_send_a_new_notification(hass, storage, install_litter, monkeypatch):
    litter_id, _ = install_litter()
    runtime = PuppyTrackerRuntimeData(storage=storage)
    runtime.weighing_session.update(status="completed", litter_id=litter_id, completed_at="2026-10-23T08:00:00+00:00")
    manager = PuppyNotificationManager(hass, MagicMock(), storage, runtime)
    manager._async_send_notify_entities = AsyncMock()
    create = Mock()
    monkeypatch.setattr("custom_components.puppy_tracker.notifications.async_create_persistent_notification", create)
    await manager._process_completed_session(["notify.phone"])
    manager._async_send_notify_entities.assert_not_awaited()
    create.assert_not_called()


@pytest.mark.parametrize("after_disable", ["completed", "active", "idle"])
async def test_completion_toggle_disables_creation_but_never_cleanup(hass, storage, install_litter, monkeypatch, after_disable):
    litter_id, puppy_id = install_litter()
    runtime = PuppyTrackerRuntimeData(storage=storage)
    manager = PuppyNotificationManager(hass, MagicMock(), storage, runtime)
    manager._process_puppy_status = AsyncMock()
    manager._async_send_notify_entities = AsyncMock()
    dismiss, clear, create = Mock(), AsyncMock(), Mock()
    monkeypatch.setattr("custom_components.puppy_tracker.notifications.async_create_persistent_notification", create)
    monkeypatch.setattr("custom_components.puppy_tracker.notifications.async_dismiss_persistent_notification", dismiss)
    monkeypatch.setattr("custom_components.puppy_tracker.notifications.async_clear_notify_entities", clear)
    storage._data["settings"].update(notifications_enabled=True, notify_session_complete=True,
                                    notify_entities=["notify.phone"])
    runtime.weighing_session.update(status="completed", litter_id=litter_id, puppy_ids=[puppy_id],
                                    weighed_puppy_ids=[puppy_id], completed_at="2026-10-23T08:00:00+00:00")
    await manager.async_check()
    assert create.call_count == 1
    storage._data["settings"]["notify_session_complete"] = False
    runtime.weighing_session["status"] = after_disable
    await manager.async_check()
    await manager.async_check()
    dismiss.assert_called_once_with(hass, manager._session_notification_id(litter_id))
    clear.assert_awaited_once_with(hass, ["notify.phone"], manager._session_notification_id(litter_id))
    assert create.call_count == 1
    assert manager._async_send_notify_entities.await_count == 1
    assert manager._last_session_litter_id is None


async def test_recurring_manager_rechecks_after_signal_during_active_check(
    hass, storage
) -> None:
    """A dashboard update arriving mid-check must not wait for the timer."""
    runtime = PuppyTrackerRuntimeData(storage=storage)
    manager = RecurringReminderNotificationManager(hass, MagicMock(), runtime)
    calls = 0

    async def check() -> None:
        nonlocal calls
        calls += 1
        if calls == 1:
            manager._schedule()

    manager.async_check = check
    manager._schedule()
    task = manager._task
    assert task is not None
    await task

    assert calls == 2


async def test_recurring_manager_does_not_restart_check_while_stopping(
    hass, storage
) -> None:
    """Cancellation cannot leave an orphaned follow-up notification task."""
    runtime = PuppyTrackerRuntimeData(storage=storage)
    manager = RecurringReminderNotificationManager(hass, MagicMock(), runtime)
    started = asyncio.Event()

    async def check() -> None:
        started.set()
        manager._schedule()
        await asyncio.sleep(60)

    manager.async_check = check
    manager._schedule()
    await started.wait()
    await manager.async_stop()

    assert manager._task is None
    assert manager._stopping is True


async def test_future_recurring_reminder_does_not_send_clear_calls(
    hass, storage, monkeypatch
) -> None:
    """Only previously active reminders need persistent/mobile cleanup."""
    store = RecurringReminderStore(hass)
    store._data = {"reminders": {"reminder-1": {"id": "reminder-1"}}}
    runtime = PuppyTrackerRuntimeData(storage=storage, recurring_reminders=store)
    manager = RecurringReminderNotificationManager(hass, MagicMock(), runtime)
    clear = AsyncMock()

    monkeypatch.setattr(
        "custom_components.puppy_tracker.recurring_notifications.async_reconcile_recurring_reminders",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "custom_components.puppy_tracker.recurring_notifications.async_check_care_notifications",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "custom_components.puppy_tracker.recurring_notifications.reminder_status",
        lambda reminder, **kwargs: {"id": reminder["id"], "status": "upcoming"},
    )
    monkeypatch.setattr(
        "custom_components.puppy_tracker.recurring_notifications.async_clear_notify_entities",
        clear,
    )

    await manager.async_check()

    clear.assert_not_awaited()


async def test_deleted_recurring_reminder_clears_once(
    hass, storage, monkeypatch
) -> None:
    """Removing an active reminder retracts its notification exactly once."""
    store = RecurringReminderStore(hass)
    store._data = {"reminders": {}}
    runtime = PuppyTrackerRuntimeData(storage=storage, recurring_reminders=store)
    manager = RecurringReminderNotificationManager(hass, MagicMock(), runtime)
    manager._states["reminder-1"] = ("overdue", "2026-09-07T12:00:00+02:00")
    clear = AsyncMock()
    monkeypatch.setattr(
        "custom_components.puppy_tracker.recurring_notifications.async_reconcile_recurring_reminders",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "custom_components.puppy_tracker.recurring_notifications.async_check_care_notifications",
        AsyncMock(),
    )
    monkeypatch.setattr(
        "custom_components.puppy_tracker.recurring_notifications.async_clear_notify_entities",
        clear,
    )

    await manager.async_check()
    await manager.async_check()

    clear.assert_awaited_once_with(
        hass,
        storage.get_settings()["notify_entities"],
        manager._notification_id("reminder-1"),
    )


async def test_inactive_puppy_clears_tagged_mobile_notification(
    hass, storage, install_litter, monkeypatch
) -> None:
    """Deactivating a puppy clears both notification delivery surfaces."""
    litter_id, puppy_id = install_litter(puppy_overrides={"active": False})
    storage._data["settings"]["notifications_enabled"] = True
    storage._data["settings"]["notify_entities"] = ["notify.phone"]
    runtime = PuppyTrackerRuntimeData(storage=storage)
    manager = PuppyNotificationManager(hass, MagicMock(), storage, runtime)
    manager._puppy_state[puppy_id] = {
        "litter_id": litter_id,
        "needs_attention": True,
        "status_code": "weight_loss",
    }
    clear = AsyncMock()
    monkeypatch.setattr(
        "custom_components.puppy_tracker.notifications.async_clear_notify_entities",
        clear,
    )

    await manager.async_check()

    clear.assert_awaited_once_with(
        hass, ["notify.phone"], manager._puppy_notification_id(puppy_id)
    )
    assert puppy_id not in manager._puppy_state


async def test_disabling_notifications_clears_active_mobile_tags(
    hass, storage, install_litter, monkeypatch
) -> None:
    """The global switch immediately clears previously delivered puppy alerts."""
    litter_id, puppy_id = install_litter()
    storage._data["settings"]["notifications_enabled"] = False
    storage._data["settings"]["notify_entities"] = ["notify.phone"]
    runtime = PuppyTrackerRuntimeData(storage=storage)
    manager = PuppyNotificationManager(hass, MagicMock(), storage, runtime)
    manager._puppy_state[puppy_id] = {
        "litter_id": litter_id,
        "needs_attention": True,
        "status_code": "weight_loss",
    }
    clear = AsyncMock()
    monkeypatch.setattr(
        "custom_components.puppy_tracker.notifications.async_clear_notify_entities",
        clear,
    )

    await manager.async_check()

    clear.assert_awaited_once_with(
        hass, ["notify.phone"], manager._puppy_notification_id(puppy_id)
    )
    assert manager._puppy_state == {}
