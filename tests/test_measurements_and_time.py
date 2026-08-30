"""Tests for canonical timestamp and measurement helpers."""

from __future__ import annotations

from custom_components.puppy_weight_tracker.measurements import (
    is_active_measurement,
    measurement_status,
    sorted_measurements,
)
from custom_components.puppy_weight_tracker.time_utils import (
    normalize_timestamp,
    parse_timestamp,
    timestamp_sort_key,
)


def test_mixed_timezone_measurements_sort_by_instant(make_measurement) -> None:
    """Offset strings must be ordered by their actual UTC instant."""
    later_utc = make_measurement(
        "later",
        667,
        "2026-08-28T19:11:00+00:00",
    )
    earlier_local = make_measurement(
        "earlier",
        666,
        "2026-08-28T20:35:00+02:00",
    )

    result = sorted_measurements([later_utc, earlier_local])

    assert [item["id"] for item in result] == ["earlier", "later"]


def test_measurement_order_has_deterministic_tie_breaker(make_measurement) -> None:
    first = make_measurement(
        "a",
        400,
        "2026-08-28T10:00:00+00:00",
        created_at="2026-08-28T10:00:01+00:00",
    )
    second = make_measurement(
        "b",
        401,
        "2026-08-28T10:00:00+00:00",
        created_at="2026-08-28T10:00:02+00:00",
    )

    assert [item["id"] for item in sorted_measurements([second, first])] == ["a", "b"]


def test_active_filter_excludes_deleted_and_superseded(make_measurement) -> None:
    active = make_measurement("active", 420, "2026-08-28T12:00:00+00:00")
    deleted = make_measurement(
        "deleted",
        410,
        "2026-08-28T11:00:00+00:00",
        deleted=True,
    )
    old = make_measurement(
        "old",
        400,
        "2026-08-28T10:00:00+00:00",
        superseded_by="active",
    )

    result = sorted_measurements([deleted, active, old], active_only=True)

    assert result == [active]
    assert is_active_measurement(active) is True
    assert measurement_status(active) == "active"
    assert measurement_status(deleted) == "deleted"
    assert measurement_status(old) == "superseded"


def test_normalize_timestamp_preserves_instant() -> None:
    normalized = normalize_timestamp("2026-08-28T20:35:00+02:00")

    assert normalized == "2026-08-28T18:35:00+00:00"
    assert parse_timestamp(normalized).timestamp() == parse_timestamp(
        "2026-08-28T20:35:00+02:00"
    ).timestamp()


def test_invalid_timestamp_sorts_before_valid_values() -> None:
    assert timestamp_sort_key("not-a-date") == float("-inf")
    assert timestamp_sort_key("2026-08-28T10:00:00+00:00") > float("-inf")


def test_measurement_order_includes_seconds_and_fractional_seconds(make_measurement) -> None:
    earlier = make_measurement(
        "earlier",
        400,
        "2026-08-28T10:00:20.100000+00:00",
    )
    later = make_measurement(
        "later",
        420,
        "2026-08-28T10:00:20.900000+00:00",
    )

    assert [item["id"] for item in sorted_measurements([later, earlier])] == [
        "earlier",
        "later",
    ]
