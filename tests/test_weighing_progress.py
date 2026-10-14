"""Expose session membership for selectable frontend completion markers."""

from inspect import unwrap
from unittest.mock import AsyncMock, Mock

import pytest

from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData
from custom_components.puppy_tracker.sensor import WeighingSessionProgressSensor
from custom_components.puppy_tracker.session import new_session_state
from custom_components.puppy_tracker.session import mark_weight_recorded
from custom_components.puppy_tracker import api


def test_progress_identifies_weighed_puppies_and_clears_after_reset(hass):
    entry = MockConfigEntry(domain=DOMAIN)
    entry.runtime_data = PuppyTrackerRuntimeData(storage=Mock())
    session = entry.runtime_data.weighing_session
    session.update(status="active", litter_id="l1", puppy_ids=["p1", "p2"], weighed_puppy_ids=["p2"])
    sensor = WeighingSessionProgressSensor(hass, entry)
    attributes = sensor.extra_state_attributes
    assert attributes["litter_id"] == "l1"
    assert attributes["weighed_puppy_ids"] == ["p2"]
    assert attributes["percentage"] == 50
    attributes["weighed_puppy_ids"].clear()
    assert session["weighed_puppy_ids"] == ["p2"]
    session["status"] = "completed"
    assert sensor.extra_state_attributes["weighed_puppy_ids"] == ["p2"]
    entry.runtime_data.weighing_session = new_session_state()
    assert sensor.extra_state_attributes["litter_id"] is None
    assert sensor.extra_state_attributes["weighed_puppy_ids"] == []


@pytest.mark.parametrize("current_id", ["m1", "another-measurement"])
async def test_correcting_last_measurement_tracks_replacement_only_for_exact_match(hass, monkeypatch, current_id):
    storage = Mock()
    storage.async_correct_measurement = AsyncMock(return_value="m2")
    runtime = PuppyTrackerRuntimeData(storage=storage)
    mark_weight_recorded(runtime, litter_id="l1", puppy_id="p1", puppy_name="Alice", weight=428, measurement_id=current_id)
    assert runtime.weighing_session["last_litter_id"] == "l1"
    assert runtime.weighing_session["last_measurement_id"] == current_id
    monkeypatch.setattr(api, "_storage_or_error", lambda *_: storage)
    monkeypatch.setattr(api, "get_runtime_data", lambda *_: runtime)
    monkeypatch.setattr(api, "_puppy_measurements_payload", lambda *_: {})
    connection = Mock()
    await unwrap(api.websocket_correct_measurement)(hass, connection, {
        "id": 1, "litter_id": "l1", "puppy_id": "p1", "measurement_id": "m1", "weight": 420,
    })
    session = runtime.weighing_session
    assert session["last_measurement_id"] == ("m2" if current_id == "m1" else current_id)
    assert session["last_weight"] == (420 if current_id == "m1" else 428)
    storage.async_correct_measurement.assert_awaited_once_with("l1", "p1", "m1", new_weight=420, new_timestamp=None, reason=None)
