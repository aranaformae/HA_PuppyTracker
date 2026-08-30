"""Tests for conservative storage integrity checks and repairs."""

from __future__ import annotations

from copy import deepcopy

from custom_components.puppy_tracker.integrity import inspect_and_repair_data


def _data(measurements: list[dict], *, puppy_overrides: dict | None = None) -> dict:
    puppy = {
        "id": "puppy-1",
        "name": "Groen",
        "birth_weight": 400.0,
        "birth_time": "2026-08-28T10:00:00+00:00",
        "birth_measurement_id": None,
        "measurements": deepcopy(measurements),
    }
    if puppy_overrides:
        puppy.update(deepcopy(puppy_overrides))
    return {
        "litters": {
            "litter-1": {
                "id": "litter-1",
                "puppies": {"puppy-1": puppy},
            }
        }
    }


def test_valid_correction_chain_is_healthy(make_measurement) -> None:
    a = make_measurement(
        "a",
        400,
        "2026-08-28T10:00:00+00:00",
        superseded_by="b",
    )
    b = make_measurement(
        "b",
        420,
        "2026-08-28T10:00:00+00:00",
        source_measurement_id="a",
    )

    changed, report = inspect_and_repair_data(_data([a, b]), repair=True)

    assert changed is False
    assert report["healthy"] is True
    assert report["unresolved_critical"] == 0


def test_dangling_successor_is_safely_repaired(make_measurement) -> None:
    a = make_measurement(
        "a",
        400,
        "2026-08-28T10:00:00+00:00",
        superseded_by="missing",
    )
    data = _data([a])

    changed, report = inspect_and_repair_data(data, repair=True)

    assert changed is True
    assert data["litters"]["litter-1"]["puppies"]["puppy-1"]["measurements"][0]["superseded_by"] is None
    assert report["repair_counts"]["dangling_successor"] == 1
    assert report["unresolved_critical"] == 0


def test_duplicate_ids_are_never_guessed_or_repaired(make_measurement) -> None:
    first = make_measurement("same", 400, "2026-08-28T10:00:00+00:00")
    second = make_measurement("same", 410, "2026-08-28T11:00:00+00:00")
    data = _data([first, second])

    changed, report = inspect_and_repair_data(data, repair=True)

    assert changed is False
    assert report["healthy"] is False
    assert report["issue_counts"]["duplicate_measurement_id"] == 1
    assert report["unresolved_critical"] >= 1


def test_ambiguous_branch_remains_critical(make_measurement) -> None:
    a = make_measurement("a", 400, "2026-08-28T10:00:00+00:00")
    b = make_measurement(
        "b",
        410,
        "2026-08-28T11:00:00+00:00",
        source_measurement_id="a",
    )
    c = make_measurement(
        "c",
        420,
        "2026-08-28T12:00:00+00:00",
        source_measurement_id="a",
    )

    changed, report = inspect_and_repair_data(_data([a, b, c]), repair=True)

    assert changed is False
    assert report["healthy"] is False
    assert report["issue_counts"]["correction_branch"] >= 1
    assert report["unresolved_critical"] >= 1
