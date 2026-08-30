"""Regression tests for explicit dashboard selection reconciliation."""

from __future__ import annotations

from custom_components.puppy_tracker.runtime import (
    PuppyTrackerRuntimeData,
    reconcile_dashboard_selection,
)


def test_runtime_exports_reconcile_helper(storage) -> None:
    """The runtime module must expose the helper imported by integration setup."""
    runtime = PuppyTrackerRuntimeData(storage=storage)
    assert reconcile_dashboard_selection(runtime) is False


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
