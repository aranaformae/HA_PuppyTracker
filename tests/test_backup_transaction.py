"""Coordinated multi-store backup restore transaction tests."""

from __future__ import annotations

import json
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.backup import (
    build_export_document,
    parse_export_json,
    prepare_import,
)
from custom_components.puppy_tracker.backup_transaction import (
    async_apply_import_transaction,
    async_restore_storage_snapshot,
)
from custom_components.puppy_tracker.care_programs import (
    AgeBasedCareProgramStore,
    normalize_care_program,
)
from custom_components.puppy_tracker.care_reminders import CareReminderStore
from custom_components.puppy_tracker.recurring_reminders import (
    RecurringReminderStore,
    normalize_reminder,
)

TARGET_CARE_SETTINGS = {
    "lead_days": 5,
    "categories": {"vaccination": False, "deworming": True},
}


def _source_program() -> dict:
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


def _source_reminder() -> dict:
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


def _source_schedulers() -> dict:
    return {
        "version": 1,
        "care_programs": {
            "programs": {"care-1": _source_program()},
            "quarantined_programs": {"future-care": {"future": True}},
        },
        "recurring_reminders": {
            "reminders": {"reminder-1": _source_reminder()},
            "quarantined_reminders": {"future-reminder": {"future": True}},
        },
    }


def _runtime_stores(hass):
    care = CareReminderStore(hass)
    care._data = {
        "lead_days": 2,
        "categories": {"vaccination": True, "deworming": False},
        "states": {"old-care": {"state": "overdue"}},
    }
    care._store.async_save = AsyncMock()

    programs = AgeBasedCareProgramStore(hass)
    programs._data = {
        "programs": {},
        "quarantined_programs": {"old-future-care": {"raw": "preserve"}},
    }
    programs._store.async_save = AsyncMock()

    recurring = RecurringReminderStore(hass)
    recurring._data = {
        "reminders": {},
        "quarantined_reminders": {"old-future-reminder": {"raw": "preserve"}},
    }
    recurring._store.async_save = AsyncMock()
    return care, programs, recurring


def _v5_plan(storage, install_litter):
    install_litter(measurements=[])
    document = build_export_document(
        storage,
        scope="full",
        care_reminder_settings=TARGET_CARE_SETTINGS,
        scheduler_data=_source_schedulers(),
    )
    source_data = deepcopy(document["data"])

    storage._data["litters"] = {}
    storage._data["audit_log"] = []
    before = deepcopy(storage.get_data())
    plan = prepare_import(storage, document, mode="replace_all")
    return plan, source_data, before


async def test_v5_full_restore_updates_all_stores(
    hass,
    storage,
    install_litter,
) -> None:
    plan, _source_data, _before = _v5_plan(storage, install_litter)
    care, programs, recurring = _runtime_stores(hass)
    storage._store.async_save = AsyncMock()

    result = await async_apply_import_transaction(
        storage,
        plan,
        care_reminders=care,
        care_programs=programs,
        recurring_reminders=recurring,
    )

    assert result["replaces_all"] is True
    assert storage.get_litters() == plan["candidate"]["litters"]
    assert care.get_backup_settings() == TARGET_CARE_SETTINGS
    assert care.get_states() == {}
    assert programs.get_backup_data() == _source_schedulers()["care_programs"]
    assert recurring.get_backup_data() == _source_schedulers()["recurring_reminders"]


async def test_v5_failure_rolls_back_every_store_exactly(
    hass,
    storage,
    install_litter,
) -> None:
    plan, _source_data, before_storage = _v5_plan(storage, install_litter)
    care, programs, recurring = _runtime_stores(hass)
    before_care = care.get_snapshot_data()
    before_programs = programs.get_backup_data()
    before_recurring = recurring.get_backup_data()
    storage._store.async_save = AsyncMock()

    recurring._store.async_save = AsyncMock(
        side_effect=[RuntimeError("recurring disk failure"), None, None]
    )

    with pytest.raises(RuntimeError, match="recurring disk failure"):
        await async_apply_import_transaction(
            storage,
            plan,
            care_reminders=care,
            care_programs=programs,
            recurring_reminders=recurring,
        )

    assert storage.get_data() == before_storage
    assert care.get_snapshot_data() == before_care
    assert programs.get_backup_data() == before_programs
    assert recurring.get_backup_data() == before_recurring
    assert recurring._store.async_save.await_count == 3


async def test_v4_full_restore_leaves_v5_scheduler_stores_untouched(
    hass,
    storage,
    install_litter,
) -> None:
    install_litter(measurements=[])
    payload = {
        "export_version": 4,
        "exported_at": "2026-08-31T00:00:00+00:00",
        "integration": "puppy_tracker",
        "schema_version": 7,
        "scope": "full",
        "data": deepcopy(storage.get_data()),
        "care_reminders": TARGET_CARE_SETTINGS,
    }
    document = parse_export_json(json.dumps(payload))
    storage._data["litters"] = {}
    storage._data["audit_log"] = []
    plan = prepare_import(storage, document, mode="replace_all")

    care, programs, recurring = _runtime_stores(hass)
    before_programs = programs.get_backup_data()
    before_recurring = recurring.get_backup_data()
    storage._store.async_save = AsyncMock()

    await async_apply_import_transaction(
        storage,
        plan,
        care_reminders=care,
        care_programs=programs,
        recurring_reminders=recurring,
    )

    assert care.get_backup_settings() == TARGET_CARE_SETTINGS
    assert care.get_states() == {}
    assert programs.get_backup_data() == before_programs
    assert recurring.get_backup_data() == before_recurring
    programs._store.async_save.assert_not_awaited()
    recurring._store.async_save.assert_not_awaited()


async def test_storage_snapshot_restore_preserves_exact_updated_at(storage) -> None:
    snapshot = storage.get_data()
    snapshot["updated_at"] = "2026-08-31T12:34:56+00:00"
    storage._data["updated_at"] = "2026-09-01T09:00:00+00:00"
    storage._store.async_save = AsyncMock()

    await async_restore_storage_snapshot(storage, snapshot)

    assert storage.get_data() == snapshot
    assert storage.get_data()["updated_at"] == "2026-08-31T12:34:56+00:00"
    storage._store.async_save.assert_awaited_once()


async def test_storage_snapshot_restore_rolls_back_on_save_failure(storage) -> None:
    before = storage.get_data()
    replacement = deepcopy(before)
    replacement["updated_at"] = "2026-08-31T12:34:56+00:00"
    storage._store.async_save = AsyncMock(side_effect=[RuntimeError("disk failure"), None])

    with pytest.raises(RuntimeError, match="disk failure"):
        await async_restore_storage_snapshot(storage, replacement)

    assert storage.get_data() == before
    assert storage._store.async_save.await_count == 2
