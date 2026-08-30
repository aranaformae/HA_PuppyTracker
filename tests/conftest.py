"""Shared pytest fixtures for Puppy Tracker."""

from __future__ import annotations

from copy import deepcopy
from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.storage import PuppyTrackerStorage, _empty_data


@pytest.fixture(autouse=True)
def _enable_custom_integrations(enable_custom_integrations):
    """Allow custom_components imports in Home Assistant's pytest harness."""
    yield


@pytest.fixture
def storage(hass) -> PuppyTrackerStorage:
    """Return an in-memory Puppy Tracker storage instance."""
    instance = PuppyTrackerStorage(hass)
    instance._data = _empty_data()
    instance.async_save = AsyncMock()
    return instance


@pytest.fixture
def make_measurement():
    """Build a valid measurement version with concise overrides."""

    def _make(
        measurement_id: str,
        weight: float,
        timestamp: str,
        *,
        created_at: str | None = None,
        deleted: bool = False,
        superseded_by: str | None = None,
        source_measurement_id: str | None = None,
        kind: str = "weight",
        note: str | None = None,
        correction_reason: str | None = None,
    ) -> dict:
        created = created_at or timestamp
        return {
            "id": measurement_id,
            "weight": float(weight),
            "timestamp": timestamp,
            "created_at": created,
            "updated_at": created,
            "deleted": deleted,
            "deleted_at": created if deleted else None,
            "superseded_by": superseded_by,
            "source_measurement_id": source_measurement_id,
            "kind": kind,
            "note": note,
            "correction_reason": correction_reason,
        }

    return _make


@pytest.fixture
def install_litter(storage, make_measurement):
    """Install a valid litter/puppy tree directly into in-memory storage."""

    def _install(
        *,
        litter_id: str = "litter-1",
        puppy_id: str = "puppy-1",
        measurements: list[dict] | None = None,
        puppy_overrides: dict | None = None,
        litter_overrides: dict | None = None,
    ) -> tuple[str, str]:
        measurements = deepcopy(measurements or [])
        puppy = {
            "id": puppy_id,
            "name": "Groen",
            "collar_color": "groen",
            "sex": "male",
            "birth_time": "2026-08-28T10:00:00+00:00",
            "birth_weight": 400.0,
            "birth_measurement_id": None,
            "notes": None,
            "active": True,
            "created_at": "2026-08-28T10:00:00+00:00",
            "updated_at": "2026-08-28T10:00:00+00:00",
            "measurements": measurements,
        }
        if puppy_overrides:
            puppy.update(deepcopy(puppy_overrides))

        litter = {
            "id": litter_id,
            "name": "Luna 2026",
            "birth_date": "2026-08-28",
            "mother": "Luna",
            "father": "Dutch",
            "active": True,
            "created_at": "2026-08-28T10:00:00+00:00",
            "updated_at": "2026-08-28T10:00:00+00:00",
            "last_completed_session": None,
            "puppies": {puppy_id: puppy},
        }
        if litter_overrides:
            litter.update(deepcopy(litter_overrides))

        storage._data["litters"][litter_id] = litter
        return litter_id, puppy_id

    return _install
