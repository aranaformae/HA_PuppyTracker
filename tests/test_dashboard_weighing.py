"""Atomic card commands cannot be redirected by shared HA station controls."""

import asyncio
from copy import deepcopy

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker import api
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.weighing import async_save_dashboard_weight
from tests.test_weighing_recovery import station


async def test_explicit_card_target_ignores_changed_shared_controls(station):
    runtime, _, _, litter_id, first, second = station
    reviewed = deepcopy(runtime.weighing_session)
    runtime.selected_puppy_id = second
    runtime.weight_input = 999
    mid = await async_save_dashboard_weight(runtime, litter_id=litter_id, puppy_id=first,
                                            weight=450, expected_session=reviewed,
                                            preview={"baseline_id": None})
    assert runtime.storage.get_measurement(litter_id, first, mid)["weight"] == 450
    assert not runtime.storage.get_active_measurements(litter_id, second)


async def test_card_cannot_save_after_session_reset(station):
    runtime, _, reset, litter_id, first, _ = station
    reviewed = deepcopy(runtime.weighing_session)
    await reset.async_press()
    with pytest.raises(ValueError, match="gewijzigd"):
        await async_save_dashboard_weight(runtime, litter_id=litter_id, puppy_id=first,
                                          weight=450, expected_session=reviewed, preview={"baseline_id": None})
    assert not runtime.storage.get_active_measurements(litter_id, first)


async def test_baseline_is_rechecked_inside_the_storage_lock(station):
    runtime, _, _, litter_id, first, _ = station
    await runtime.storage._lock.acquire()
    save = asyncio.create_task(async_save_dashboard_weight(runtime, litter_id=litter_id,
                               puppy_id=first, weight=450, preview={"baseline_id": "stale"}))
    await asyncio.sleep(0)
    assert not save.done()
    runtime.storage._lock.release()
    with pytest.raises(ValueError, match="vorige meting"):
        await save
    assert not runtime.storage.get_active_measurements(litter_id, first)


async def test_native_and_card_paths_share_duplicate_protection(station):
    runtime, _, _, litter_id, first, _ = station
    await async_save_dashboard_weight(runtime, litter_id=litter_id, puppy_id=first, weight=450)
    with pytest.raises(ValueError, match="dubbele meting"):
        await async_save_dashboard_weight(runtime, litter_id=litter_id, puppy_id=first, weight=451)
    await async_save_dashboard_weight(runtime, litter_id=litter_id, puppy_id=first, weight=451)
    assert len(runtime.storage.get_active_measurements(litter_id, first)) == 2


async def test_real_websocket_saves_reviewed_payload_after_shared_selection_changes(hass, hass_ws_client, station):
    runtime, _, _, litter_id, first, second = station
    entry = MockConfigEntry(domain=DOMAIN)
    entry.runtime_data = runtime
    entry.add_to_hass(hass)
    api.async_setup_api(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": "puppy_tracker/weight/preview", "litter_id": litter_id,
                                   "puppy_id": first, "weight": 450})
    preview = (await client.receive_json())["result"]
    runtime.selected_puppy_id = second
    runtime.weight_input = 999
    await client.send_json_auto_id({"type": "puppy_tracker/weight/save", "litter_id": litter_id,
        "puppy_id": first, "weight": 450, "baseline_id": preview["baseline_id"],
        "session_id": preview["session"]["id"], "revision": preview["session"]["revision"]})
    response = await client.receive_json()
    assert response["success"]
    assert runtime.storage.get_measurement(litter_id, first, response["result"]["measurement_id"])["weight"] == 450
    assert not runtime.storage.get_active_measurements(litter_id, second)
