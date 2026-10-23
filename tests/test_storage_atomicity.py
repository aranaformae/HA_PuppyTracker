"""A rejected write must never leak into later successful storage operations."""

import asyncio
from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.storage import PuppyTrackerStorage
from tests.test_followup_completion import followup_storage, _owner


@pytest.mark.parametrize("scope", ["litter", "mother", "puppy"])
@pytest.mark.parametrize("action", ["add", "edit", "delete", "restore", "move"])
@pytest.mark.parametrize("failure", [OSError, asyncio.CancelledError])
async def test_failed_dossier_mutation_restores_all_live_state(followup_storage, scope, action, failure):
    storage = followup_storage
    owner = _owner(scope)
    record_id = await storage.async_add_record("litter-1", **owner, record_type="note", note="Original")
    if action == "restore":
        await storage.async_delete_record("litter-1", record_id, **owner)
    before, report = storage.get_data(), storage.get_integrity_report()
    storage.async_save.side_effect = failure("write interrupted")
    with pytest.raises(failure):
        if action == "add":
            await storage.async_add_record("litter-1", **owner, record_type="note", note="Rejected")
        elif action == "edit":
            await storage.async_update_record("litter-1", record_id, **owner, record_type="note", note="Rejected")
        elif action == "delete":
            await storage.async_delete_record("litter-1", record_id, **owner)
        elif action == "restore":
            await storage.async_restore_record("litter-1", record_id, **owner)
        else:
            await storage.async_change_record_owner("litter-1", record_id,
                source_scope=scope, source_puppy_id="puppy-1" if scope == "puppy" else None,
                target_scope="litter" if scope != "litter" else "mother")
    assert storage.get_data() == before
    assert storage.get_integrity_report() == report
    storage.async_save.side_effect = None
    await storage.async_update_profile_note("litter-1", puppy_id="puppy-1", profile_note="A later successful save")
    assert storage.get_records("litter-1", include_deleted=True, **owner) == [
        storage.get_record("litter-1", record_id, **owner)
    ]
    assert storage.get_record("litter-1", record_id, **owner)["note"] == "Original"


@pytest.mark.parametrize("action", ["add", "correct", "delete", "restore"])
async def test_failed_weight_history_write_restores_measurements_and_audit(storage, install_litter, action):
    litter_id, puppy_id = install_litter()
    mid = await storage.async_record_weight(litter_id, puppy_id, 450)
    if action == "restore":
        await storage.async_delete_weight(litter_id, puppy_id, mid)
    before = storage.get_data()
    storage.async_save.side_effect = OSError("disk full")
    with pytest.raises(OSError):
        if action == "add":
            await storage.async_record_weight(litter_id, puppy_id, 455)
        elif action == "correct":
            await storage.async_correct_measurement(litter_id, puppy_id, mid, new_weight=455, new_timestamp=None)
        elif action == "delete":
            await storage.async_delete_weight(litter_id, puppy_id, mid)
        else:
            await storage.async_restore_weight(litter_id, puppy_id, mid)
    assert storage.get_data() == before


async def test_actual_save_failure_rolls_back_updated_timestamps_and_integrity_report(storage, install_litter):
    litter_id, puppy_id = install_litter()
    record_id = await storage.async_add_record(litter_id, puppy_id=puppy_id, record_type="note", note="Original")
    storage.async_save = PuppyTrackerStorage.async_save.__get__(storage)
    storage._store.async_save = AsyncMock(side_effect=OSError("disk full"))
    before, report = storage.get_data(), deepcopy(storage.get_integrity_report())
    with pytest.raises(OSError):
        await storage.async_update_record(litter_id, record_id, puppy_id=puppy_id, record_type="note", note="Rejected")
    assert storage.get_data() == before
    assert storage.get_integrity_report() == report
