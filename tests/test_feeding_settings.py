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
PROFILE["meat_portions_per_day"] = 3
PROFILE["meat"]["grams_per_kg"] = 47.5
PROFILE["kibble"]["method"] = "linear"


async def test_feeding_profile_is_litter_scoped_and_survives_loading(hass, storage, install_litter):
    first, _ = install_litter()
    second, _ = install_litter(litter_id="second", puppy_id="other")
    assert storage.get_feeding_settings(first) == DEFAULT_FEEDING_SETTINGS
    result = await storage.async_update_feeding_settings(first, PROFILE)
    result["meat_portions_per_day"] = 8
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
    {"meat_portions_per_day": 2.5}, {"meat_portions_per_day": 0}, {"kibble": {**PROFILE["kibble"], "method": "unknown"}},
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


@pytest.mark.parametrize("mode", ["ration", "energy"])
async def test_profile_backup_full_and_litter_import(storage, install_litter, mode):
    litter_id, _ = install_litter()
    profile = deepcopy(PROFILE)
    profile.update(allocation_mode=mode, kcal_per_kg=100)
    for food in ("kibble", "meat"):
        profile[food].update(method="age_table", kcal_per_100g=200,
                            age_tables=[{"from_day": 21, "table": [[1, 80], [3, 160]]},
                                        {"from_day": 35, "table": [[1, 100], [3, 180]]}])
    await storage.async_update_feeding_settings(litter_id, profile)
    litter_backup = build_export_document(storage, scope="litter", litter_id=litter_id)
    await async_apply_import(storage, prepare_import(storage, litter_backup, mode="new_litter"))
    imported = next(key for key in storage.get_litters() if key != litter_id)
    assert storage.get_feeding_settings(imported) == profile
    full = build_export_document(storage, scope="full", care_reminder_settings={"lead_days": 5, "categories": {"vaccination": True, "deworming": True}}, scheduler_data={"version": 1, "care_programs": {"programs": {}}, "recurring_reminders": {"reminders": {}}})
    await storage.async_update_feeding_settings(litter_id, {**PROFILE, "meat_percent": 0})
    await async_apply_import(storage, prepare_import(storage, full, mode="replace_all"))
    assert storage.get_feeding_settings(litter_id) == profile
    invalid = deepcopy(full)
    invalid["data"]["litters"][litter_id]["feeding_settings"]["meat_portions_per_day"] = 0
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
    assert converted == {**PROFILE, "meat_portions_per_day": 2}
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


@pytest.mark.parametrize("share,kibble,meat,legacy", [
    (50, 2, 2, 4), (75, 1, 2, 3), (0, 4, 0, 4),
    (100, 0, 4, 4), (50, 1, 1, 1), (1, 11, 1, 12),
])
def test_old_shared_portions_become_separate_feeding_moments(share, kibble, meat, legacy):
    result = normalize_feeding_settings({"meat_percent": share, "portions_per_day": legacy})
    assert result["kibble_portions_per_day"] == kibble
    assert result["meat_portions_per_day"] == meat
    assert "portions_per_day" not in result


@pytest.mark.parametrize("share,kibble,meat,valid", [
    (50, 1, 2, True), (50, 0, 2, False), (50, 1, 0, False),
    (0, 3, 0, True), (100, 0, 3, True), (50, 1.5, 2, False),
    (50, 1, 13, False), (50, True, 2, False),
])
def test_separate_portion_validation(share, kibble, meat, valid):
    values = {"meat_percent": share, "kibble_portions_per_day": kibble, "meat_portions_per_day": meat}
    if valid:
        result = normalize_feeding_settings(values)
        assert result["kibble_portions_per_day"] == kibble
        assert result["meat_portions_per_day"] == meat
    else:
        with pytest.raises(ValueError):
            normalize_feeding_settings(values)


def test_existing_profiles_gain_only_inactive_new_fields():
    old = deepcopy(PROFILE)
    old.pop("allocation_mode")
    old.pop("kcal_per_kg")
    for kind in ("kibble", "meat"):
        old[kind].pop("age_tables")
        old[kind].pop("kcal_per_100g")
    assert normalize_feeding_settings(old) == PROFILE


@pytest.mark.parametrize("stages", [
    [], [{"from_day": 0.5, "table": [[1, 40], [2, 80]]}],
    [{"from_day": True, "table": [[1, 40], [2, 80]]}],
    [{"from_day": -1, "table": [[1, 40], [2, 80]]}],
    [{"from_day": 3651, "table": [[1, 40], [2, 80]]}],
    [{"from_day": 0, "table": [[1, 40], [1, 80]]}],
    [{"from_day": 0, "table": [[1, 40]]}],
    [{"from_day": 0, "table": [[1, 40], [2, 80]], "unknown": 1}],
    [{"from_day": day, "table": [[1, 40], [2, 80]]} for day in (7, 7)],
    [{"from_day": day, "table": [[1, 40], [2, 80]]} for day in (7, 0)],
    [{"from_day": day, "table": [[1, 40], [2, 80]]} for day in range(25)],
])
async def test_invalid_age_profiles_are_atomic(storage, install_litter, stages):
    litter_id, _ = install_litter()
    profile = deepcopy(PROFILE)
    profile["kibble"].update(method="age_table", age_tables=stages)
    before = storage.get_data()
    with pytest.raises(ValueError):
        await storage.async_update_feeding_settings(litter_id, profile)
    assert storage.get_data() == before
    storage.async_save.assert_not_awaited()


@pytest.mark.parametrize("target,density,valid", [
    (100, 200, True), (0, 200, False), (-1, 200, False),
    (True, 200, False), (float("inf"), 200, False),
    (100, 0, False), (100, -1, False), (100, True, False),
    (100, float("nan"), False),
])
def test_energy_profile_validation(target, density, valid):
    profile = deepcopy(PROFILE)
    profile.update(allocation_mode="energy", kcal_per_kg=target)
    profile["kibble"]["kcal_per_100g"] = density
    profile["meat"]["kcal_per_100g"] = 150
    if valid:
        assert normalize_feeding_settings(profile) == profile
    else:
        with pytest.raises(ValueError):
            normalize_feeding_settings(profile)


def test_energy_mode_ignores_unused_density_and_ration_method():
    profile = deepcopy(PROFILE)
    profile.update(allocation_mode="energy", kcal_per_kg=100, meat_percent=100,
                   kibble_portions_per_day=0)
    profile["kibble"].update(method="age_table", age_tables=[])
    profile["meat"]["kcal_per_100g"] = 150
    assert normalize_feeding_settings(profile) == profile
    profile["allocation_mode"] = "other"
    with pytest.raises(ValueError):
        normalize_feeding_settings(profile)
