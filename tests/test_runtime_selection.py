"""Regression tests for explicit dashboard selection reconciliation."""

from __future__ import annotations

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.runtime import (
    PuppyTrackerRuntimeData,
    get_entry_runtime_data,
    get_runtime_data,
    get_runtime_storage,
    reconcile_dashboard_selection,
    require_runtime_data,
)


def test_runtime_exports_reconcile_helper(storage) -> None:
    """The runtime module must expose the helper imported by integration setup."""
    runtime = PuppyTrackerRuntimeData(storage=storage)
    assert reconcile_dashboard_selection(runtime) is False


def test_runtime_helpers_resolve_loaded_config_entry(hass, storage) -> None:
    runtime = PuppyTrackerRuntimeData(storage=storage)
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = runtime
    entry.add_to_hass(hass)

    assert get_entry_runtime_data(entry) is runtime
    assert get_runtime_data(hass) is runtime
    assert require_runtime_data(hass) is runtime
    assert get_runtime_storage(hass) is storage


def test_runtime_helpers_handle_unloaded_integration(hass) -> None:
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)

    assert get_entry_runtime_data(entry) is None
    assert get_runtime_data(hass) is None
    assert get_runtime_storage(hass) is None
    with pytest.raises(RuntimeError, match="not loaded"):
        require_runtime_data(hass)


def test_reconcile_selects_first_active_litter_and_puppy(
    storage,
    install_litter,
) -> None:
    """An empty dashboard selection is initialized explicitly."""
    litter_id, puppy_id = install_litter()
    runtime = PuppyTrackerRuntimeData(storage=storage)

    assert reconcile_dashboard_selection(runtime) is True
    assert runtime.selected_litter_id == litter_id
    assert runtime.selected_puppy_id == puppy_id


def test_reconcile_replaces_archived_puppy(
    storage,
    install_litter,
) -> None:
    """An archived selection falls back to the next active puppy."""
    litter_id, first_id = install_litter()
    second_id = "puppy-2"
    first = storage._data["litters"][litter_id]["puppies"][first_id]
    second = dict(first)
    second.update({"id": second_id, "name": "Paars", "collar_color": "paars"})
    storage._data["litters"][litter_id]["puppies"][second_id] = second

    runtime = PuppyTrackerRuntimeData(
        storage=storage,
        selected_litter_id=litter_id,
        selected_puppy_id=first_id,
    )
    storage._data["litters"][litter_id]["puppies"][first_id]["active"] = False

    assert reconcile_dashboard_selection(runtime) is True
    assert runtime.selected_puppy_id == second_id
