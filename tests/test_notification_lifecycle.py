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


@pytest.mark.parametrize("weight", [False, True])
async def test_recurring_manager_rechecks_after_signal_during_active_check(
    hass, storage, weight
) -> None:
    """A dashboard update arriving mid-check must not wait for the timer."""
    runtime = PuppyTrackerRuntimeData(storage=storage)
    manager = PuppyNotificationManager(hass, MagicMock(), storage, runtime) if weight else RecurringReminderNotificationManager(hass, MagicMock(), runtime)
    calls = 0

    async def check() -> None:
        nonlocal calls
        calls += 1
        if calls == 1:
            manager._runner.schedule()

    manager.async_check = check
    manager._runner.schedule()
    task = manager._runner.task
    assert task is not None
    await task

    assert calls == 2


@pytest.mark.parametrize("weight", [False, True])
async def test_recurring_manager_does_not_restart_check_while_stopping(
    hass, storage, weight
) -> None:
    """Cancellation cannot leave an orphaned follow-up notification task."""
    runtime = PuppyTrackerRuntimeData(storage=storage)
    manager = PuppyNotificationManager(hass, MagicMock(), storage, runtime) if weight else RecurringReminderNotificationManager(hass, MagicMock(), runtime)
    started = asyncio.Event()

    async def check() -> None:
        started.set()
        manager._runner.schedule()
        await asyncio.sleep(60)

    manager.async_check = check
    manager._runner.schedule()
    await started.wait()
    await manager.async_stop()

    assert manager._runner.task is None
    assert manager._runner.stopping is True


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


@pytest.mark.parametrize("inactive", ["litter", "puppy"])
async def test_recurring_inactive_owner_retracts_existing_notifications_once(hass, storage, install_litter, monkeypatch, inactive):
    litter_id, puppy_id = install_litter()
    reminders = RecurringReminderStore(hass)
    reminders._store.async_save = AsyncMock()
    reminder_id = await reminders.async_create({
        "litter_id": litter_id, "owner_scope": "puppy", "owner_id": puppy_id,
        "title": "Action", "record_type": "note", "schedule_mode": "once",
        "start_at": "2026-08-01T09:00:00+00:00", "due_at": "2026-08-02T09:00:00+00:00",
    })
    runtime = PuppyTrackerRuntimeData(storage=storage, recurring_reminders=reminders)
    manager = RecurringReminderNotificationManager(hass, MagicMock(), runtime)
    manager._states[reminder_id] = ("overdue", "old")
    target = storage._data["litters"][litter_id]
    if inactive == "puppy":
        target = target["puppies"][puppy_id]
    target["active"] = False
    clear = AsyncMock()
    monkeypatch.setattr("custom_components.puppy_tracker.recurring_notifications.async_reconcile_recurring_reminders", AsyncMock())
    monkeypatch.setattr("custom_components.puppy_tracker.recurring_notifications.async_check_care_notifications", AsyncMock())
    monkeypatch.setattr("custom_components.puppy_tracker.recurring_notifications.async_clear_notify_entities", clear)
    await manager.async_check()
    await manager.async_check()
    assert manager._states == {}
    clear.assert_awaited_once()


async def test_api_open_counts_keep_legacy_aliases_with_the_same_values(storage, install_litter):
    from datetime import timedelta
    from homeassistant.util import dt as dt_util
    from custom_components.puppy_tracker.api import _puppy_summary, _litter_summary

    litter_id, puppy_id = install_litter()
    await storage.async_add_record(litter_id, puppy_id=puppy_id, record_type="deworming",
                                   data={"product": "Product", "next_due_date": (dt_util.now().date() + timedelta(days=20)).isoformat()})
    litter = storage.get_litter(litter_id)
    puppy = litter["puppies"][puppy_id]
    summary = _puppy_summary(storage, litter_id, puppy_id, puppy)
    assert summary["dossier_has_open_actions"] is summary["dossier_due_soon"] is True
    assert summary["dossier_actions"]["upcoming_count"] == 1
    assert summary["dossier_actions"]["attention_count"] == 0
    whole = _litter_summary(storage, litter_id, litter, {puppy_id: summary})
    assert whole["dossier_open_count"] == whole["dossier_due_soon_count"] == 1


async def test_inactive_litter_retracts_grouped_care_notifications_once(hass, storage, install_litter, monkeypatch):
    from custom_components.puppy_tracker import care_notifications
    from custom_components.puppy_tracker.care_programs import AgeBasedCareProgramStore, normalize_care_program

    litter_id, _ = install_litter(litter_overrides={"active": False})
    storage._data["settings"]["notifications_enabled"] = True
    store = AgeBasedCareProgramStore(hass)
    program = normalize_care_program({"litter_id": litter_id, "title": "ENS", "record_type": "note", "schedule_type": "once", "start_age_days": 3}, program_id="ens")
    store._data = {"programs": {"ens": program}}
    runtime = PuppyTrackerRuntimeData(storage=storage, care_programs=store)
    state = care_notifications._state(hass)
    state["active_groups"] = {"old"}
    clear, create = AsyncMock(), Mock()
    monkeypatch.setattr(care_notifications, "async_clear_notify_entities", clear)
    monkeypatch.setattr(care_notifications, "async_create_persistent_notification", create)
    await care_notifications.async_check_care_notifications(hass, runtime)
    await care_notifications.async_check_care_notifications(hass, runtime)
    clear.assert_awaited_once()
    create.assert_not_called()
    assert not state["active_groups"]
