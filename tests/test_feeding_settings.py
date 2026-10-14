"""Feeding profiles are validated, litter-scoped and portable."""

from copy import deepcopy
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.exceptions import Unauthorized
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.api import websocket_update_feeding_settings
from custom_components.puppy_tracker.backup import BackupValidationError, async_apply_import, build_export_document, prepare_import
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.feeding import DEFAULT_FEEDING_SETTINGS, normalize_feeding_settings
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData
from custom_components.puppy_tracker.storage import PuppyTrackerStorage

PROFILE = deepcopy(DEFAULT_FEEDING_SETTINGS)
PROFILE["meat_percent"] = 75
PROFILE["portions_per_day"] = 3
PROFILE["meat"]["grams_per_kg"] = 47.5
PROFILE["kibble"]["method"] = "linear"


async def test_feeding_profile_is_litter_scoped_and_survives_loading(hass, storage, install_litter):
    first, _ = install_litter()
    second, _ = install_litter(litter_id="second", puppy_id="other")
    assert storage.get_feeding_settings(first) == DEFAULT_FEEDING_SETTINGS
    result = await storage.async_update_feeding_settings(first, PROFILE)
    result["portions_per_day"] = 8
    assert storage.get_feeding_settings(first) == PROFILE
    assert storage.get_feeding_settings(second) == DEFAULT_FEEDING_SETTINGS
    reloaded = PuppyTrackerStorage(hass)
    reloaded._store.async_load = AsyncMock(return_value=storage.get_data())
    reloaded.async_save = AsyncMock()
    await reloaded.async_load()
    assert reloaded.get_feeding_settings(first) == PROFILE
    storage.async_save.reset_mock()
    await storage.async_update_feeding_settings(first, PROFILE)
    storage.async_save.assert_not_awaited()


@pytest.mark.parametrize("change", [
    {"meat_percent": -1}, {"meat_percent": 101}, {"meat": {**PROFILE["meat"], "grams_per_kg": -1}},
    {"portions_per_day": 2.5}, {"portions_per_day": 0}, {"kibble": {**PROFILE["kibble"], "method": "unknown"}},
    {"meat": {**PROFILE["meat"], "grams_per_kg": float("nan")}}, {"meat_percent": True},
    {"kibble": {**PROFILE["kibble"], "table": [[1, 40], [1, 80]]}},
    {"meat": {**PROFILE["meat"], "table": [[2, 90], [1, 45]]}},
    {"kibble": {**PROFILE["kibble"], "table": [[1, 40], [2, -1]]}},
    {"meat": {**PROFILE["meat"], "min_kg": 20}},
    {"kibble": {**PROFILE["kibble"], "coefficient": 0, "offset": 0}},
])
async def test_invalid_feeding_profile_does_not_modify_storage(storage, install_litter, change):
    litter_id, _ = install_litter()
    before = storage.get_data()
    with pytest.raises(ValueError):
        await storage.async_update_feeding_settings(litter_id, {**PROFILE, **change})
    assert storage.get_data() == before
    storage.async_save.assert_not_awaited()


async def test_failed_feeding_save_restores_profile_audit_and_timestamps(storage, install_litter):
    litter_id, _ = install_litter()
    await storage.async_update_feeding_settings(litter_id, PROFILE)
    before = storage.get_data()
    storage.async_save = AsyncMock(side_effect=OSError("save failed"))
    with pytest.raises(OSError):
        await storage.async_update_feeding_settings(litter_id, {**PROFILE, "meat_percent": 0})
    assert storage.get_data() == before
    with pytest.raises(ValueError):
        await storage.async_update_feeding_settings("missing", PROFILE)


async def test_profile_backup_full_and_litter_import(storage, install_litter):
    litter_id, _ = install_litter()
    await storage.async_update_feeding_settings(litter_id, PROFILE)
    litter_backup = build_export_document(storage, scope="litter", litter_id=litter_id)
    await async_apply_import(storage, prepare_import(storage, litter_backup, mode="new_litter"))
    imported = next(key for key in storage.get_litters() if key != litter_id)
    assert storage.get_feeding_settings(imported) == PROFILE
    full = build_export_document(storage, scope="full", care_reminder_settings={"lead_days": 5, "categories": {"vaccination": True, "deworming": True}}, scheduler_data={"version": 1, "care_programs": {"programs": {}}, "recurring_reminders": {"reminders": {}}})
    await storage.async_update_feeding_settings(litter_id, {**PROFILE, "meat_percent": 0})
    await async_apply_import(storage, prepare_import(storage, full, mode="replace_all"))
    assert storage.get_feeding_settings(litter_id) == PROFILE
    invalid = deepcopy(full)
    invalid["data"]["litters"][litter_id]["feeding_settings"]["portions_per_day"] = 0
    with pytest.raises(BackupValidationError):
        prepare_import(storage, invalid, mode="replace_all")


async def test_feeding_update_api_requires_admin(hass, storage, install_litter):
    litter_id, _ = install_litter()
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = PuppyTrackerRuntimeData(storage=storage)
    entry.add_to_hass(hass)
    connection = MagicMock()
    connection.user = SimpleNamespace(is_admin=False)
    message = {"id": 1, "type": "puppy_tracker/feeding_settings/update", "litter_id": litter_id, "settings": PROFILE}
    with pytest.raises(Unauthorized):
        websocket_update_feeding_settings(hass, connection, message)
    assert storage.get_feeding_settings(litter_id) == DEFAULT_FEEDING_SETTINGS
    connection.user = SimpleNamespace(is_admin=True)
    websocket_update_feeding_settings(hass, connection, message)
    await hass.async_block_till_done()
    connection.send_result.assert_called_once_with(1, {"settings": PROFILE})
    assert storage.get_feeding_settings(litter_id) == PROFILE


def test_legacy_preferences_keep_the_original_rations():
    converted = normalize_feeding_settings({"meat_percent": 75, "portions_per_day": 3,
                                           "kivo_grams_per_kg": 47.5, "kibble_formula": "linear"})
    assert converted == PROFILE
    assert "kivo_grams_per_kg" not in converted


@pytest.mark.parametrize("method", ["linear", "table", "per_kg"])
async def test_custom_food_profiles_persist_for_both_foods(storage, install_litter, method):
    litter_id, _ = install_litter()
    profile = deepcopy(PROFILE)
    for kind in ("kibble", "meat"):
        profile[kind].update(method=method, grams_per_kg=80, coefficient=20, offset=10,
                             min_kg=0.5, max_kg=30, table=[[0.5, 50], [10, 500], [30, 1100]])
    await storage.async_update_feeding_settings(litter_id, profile)
    assert storage.get_feeding_settings(litter_id) == profile
