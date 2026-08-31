"""Regression tests for dossier care reminder notifications."""

from __future__ import annotations

from datetime import timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.util import dt as dt_util

from custom_components.puppy_tracker.care_reminders import (
    CareReminderStore,
    _default_data,
)
from custom_components.puppy_tracker.notifications import (
    PuppyNotificationManager,
    care_reminder_stage,
    care_reminder_thresholds,
)
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData


@pytest.mark.parametrize(
    ("lead_days", "expected"),
    [
        (0, ()),
        (1, (1,)),
        (3, (3, 1)),
        (7, (7, 3, 1)),
        (10, (10, 7, 3, 1)),
    ],
)
def test_care_reminder_thresholds(lead_days, expected):
    """Configured lead time keeps useful 7/3/1 milestones below it."""
    assert care_reminder_thresholds(lead_days) == expected


@pytest.mark.parametrize(
    ("days_until", "lead_days", "expected"),
    [
        (8, 7, None),
        (7, 7, "upcoming:7"),
        (6, 7, "upcoming:7"),
        (3, 7, "upcoming:3"),
        (2, 7, "upcoming:3"),
        (1, 7, "upcoming:1"),
        (0, 7, "due_today"),
        (-1, 7, "overdue"),
        (1, 0, None),
        (0, 0, "due_today"),
        (-5, 0, "overdue"),
    ],
)
def test_care_reminder_stage(days_until, lead_days, expected):
    """Reminder stages advance only at configured milestones."""
    assert care_reminder_stage(days_until, lead_days) == expected


def _care_store(hass) -> CareReminderStore:
    store = CareReminderStore(hass)
    store._data = _default_data()
    store._store.async_save = AsyncMock()
    return store


def _record(
    *,
    record_id: str,
    record_type: str,
    litter_id: str,
    puppy_id: str,
    due_date: str,
) -> dict:
    return {
        "id": record_id,
        "type": record_type,
        "scope": "puppy",
        "litter_id": litter_id,
        "puppy_id": puppy_id,
        "occurred_at": "2026-08-31T04:00:00+00:00",
        "created_at": "2026-08-31T04:00:00+00:00",
        "updated_at": "2026-08-31T04:00:00+00:00",
        "deleted": False,
        "deleted_at": None,
        "title": "Routine care",
        "note": None,
        "data": {"next_due_date": due_date},
    }


def _manager(hass, storage, care_store):
    runtime = PuppyTrackerRuntimeData(
        storage=storage,
        care_reminders=care_store,
    )
    return PuppyNotificationManager(
        hass,
        MagicMock(),
        storage,
        runtime,
    )


async def test_care_reminder_store_updates_preferences(hass):
    """Reminder preferences are persisted independently from litter storage."""
    store = _care_store(hass)

    await store.async_set_lead_days(3)
    await store.async_set_category_enabled("deworming", False)

    assert store.get_lead_days() == 3
    assert store.category_enabled("vaccination") is True
    assert store.category_enabled("deworming") is False
    assert store._store.async_save.await_count == 2


async def test_care_reminder_transitions_are_deduplicated(
    hass,
    storage,
    install_litter,
    monkeypatch,
):
    """One action notifies once per 7/3/1/today/overdue transition."""
    today = dt_util.now().date()
    litter_id, puppy_id = install_litter()
    puppy = storage._data["litters"][litter_id]["puppies"][puppy_id]
    puppy["records"] = [
        _record(
            record_id="vaccination-1",
            record_type="vaccination",
            litter_id=litter_id,
            puppy_id=puppy_id,
            due_date=(today + timedelta(days=7)).isoformat(),
        )
    ]

    store = _care_store(hass)
    manager = _manager(hass, storage, store)
    create = MagicMock()
    dismiss = MagicMock()
    monkeypatch.setattr(
        "custom_components.puppy_tracker.notifications.async_create_persistent_notification",
        create,
    )
    monkeypatch.setattr(
        "custom_components.puppy_tracker.notifications.async_dismiss_persistent_notification",
        dismiss,
    )

    await manager._process_care_reminders(
        store,
        notify_recovery=True,
        notify_entities=[],
    )
    assert create.call_count == 1
    state = next(iter(store.get_states().values()))
    assert state["stage"] == "upcoming:7"

    # Same derived state must not repeat, including after manager recreation.
    await manager._process_care_reminders(
        store,
        notify_recovery=True,
        notify_entities=[],
    )
    restarted_manager = _manager(hass, storage, store)
    await restarted_manager._process_care_reminders(
        store,
        notify_recovery=True,
        notify_entities=[],
    )
    assert create.call_count == 1

    for days, expected_stage, expected_calls in (
        (3, "upcoming:3", 2),
        (1, "upcoming:1", 3),
        (0, "due_today", 4),
        (-1, "overdue", 5),
    ):
        puppy["records"][0]["data"]["next_due_date"] = (
            today + timedelta(days=days)
        ).isoformat()
        await manager._process_care_reminders(
            store,
            notify_recovery=True,
            notify_entities=[],
        )
        assert create.call_count == expected_calls
        state = next(iter(store.get_states().values()))
        assert state["stage"] == expected_stage

    await manager._process_care_reminders(
        store,
        notify_recovery=True,
        notify_entities=[],
    )
    assert create.call_count == 5

    puppy["records"] = []
    await manager._process_care_reminders(
        store,
        notify_recovery=True,
        notify_entities=[],
    )
    assert store.get_states() == {}
    assert dismiss.call_count >= 1


async def test_disabled_care_category_is_not_notified(
    hass,
    storage,
    install_litter,
    monkeypatch,
):
    """Per-category toggles suppress and clear matching reminders."""
    today = dt_util.now().date()
    litter_id, puppy_id = install_litter()
    puppy = storage._data["litters"][litter_id]["puppies"][puppy_id]
    puppy["records"] = [
        _record(
            record_id="vaccination-1",
            record_type="vaccination",
            litter_id=litter_id,
            puppy_id=puppy_id,
            due_date=(today + timedelta(days=3)).isoformat(),
        ),
        _record(
            record_id="deworming-1",
            record_type="deworming",
            litter_id=litter_id,
            puppy_id=puppy_id,
            due_date=(today + timedelta(days=3)).isoformat(),
        ),
    ]

    store = _care_store(hass)
    await store.async_set_category_enabled("deworming", False)
    manager = _manager(hass, storage, store)
    create = MagicMock()
    monkeypatch.setattr(
        "custom_components.puppy_tracker.notifications.async_create_persistent_notification",
        create,
    )

    await manager._process_care_reminders(
        store,
        notify_recovery=True,
        notify_entities=[],
    )

    assert create.call_count == 1
    states = store.get_states()
    assert len(states) == 1
    assert next(iter(states.values()))["category"] == "vaccination"


async def test_due_care_resolution_sends_optional_mobile_recovery(
    hass,
    storage,
    install_litter,
    monkeypatch,
):
    """A due/overdue action clears and can emit one truthful recovery push."""
    today = dt_util.now().date()
    litter_id, puppy_id = install_litter()
    puppy = storage._data["litters"][litter_id]["puppies"][puppy_id]
    puppy["records"] = [
        _record(
            record_id="deworming-1",
            record_type="deworming",
            litter_id=litter_id,
            puppy_id=puppy_id,
            due_date=today.isoformat(),
        )
    ]

    store = _care_store(hass)
    manager = _manager(hass, storage, store)
    monkeypatch.setattr(
        "custom_components.puppy_tracker.notifications.async_create_persistent_notification",
        MagicMock(),
    )
    monkeypatch.setattr(
        "custom_components.puppy_tracker.notifications.async_dismiss_persistent_notification",
        MagicMock(),
    )
    manager._async_send_notify_entities = AsyncMock()

    await manager._process_care_reminders(
        store,
        notify_recovery=True,
        notify_entities=["notify.phone"],
    )
    assert manager._async_send_notify_entities.await_count == 1

    puppy["records"] = []
    await manager._process_care_reminders(
        store,
        notify_recovery=True,
        notify_entities=["notify.phone"],
    )
    assert manager._async_send_notify_entities.await_count == 2
    _targets, title, message = manager._async_send_notify_entities.await_args.args
    assert "bijgewerkt" in title.lower()
    assert "niet meer verschuldigd" in message.lower()
