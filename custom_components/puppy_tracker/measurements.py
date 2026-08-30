"""Shared measurement helpers for Puppy Tracker."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any, Iterable

from .time_utils import parse_timestamp, timestamp_sort_key


def is_active_measurement(measurement: dict[str, Any]) -> bool:
    """Return whether a measurement is the effective version in its chain."""
    return (
        not measurement.get("deleted", False)
        and measurement.get("superseded_by") is None
    )


def measurement_status(measurement: dict[str, Any]) -> str:
    """Return the storage status of a measurement version."""
    if measurement.get("deleted", False):
        return "deleted"
    if measurement.get("superseded_by") is not None:
        return "superseded"
    return "active"


def measurement_sort_key(measurement: dict[str, Any]) -> tuple[float, float, str]:
    """Return a deterministic, timezone-safe chronological measurement key."""
    return (
        timestamp_sort_key(measurement.get("timestamp")),
        timestamp_sort_key(measurement.get("created_at")),
        str(measurement.get("id") or ""),
    )


def sorted_measurements(
    measurements: Iterable[dict[str, Any]],
    *,
    active_only: bool = False,
    newest_first: bool = False,
    copy_items: bool = False,
) -> list[dict[str, Any]]:
    """Return measurements in a consistent chronological order."""
    result = [
        deepcopy(measurement) if copy_items else measurement
        for measurement in measurements
        if not active_only or is_active_measurement(measurement)
    ]
    result.sort(key=measurement_sort_key, reverse=newest_first)
    return result


def puppy_measurements(
    puppy: dict[str, Any],
    *,
    active_only: bool = False,
    newest_first: bool = False,
    copy_items: bool = False,
) -> list[dict[str, Any]]:
    """Return one puppy's measurements using the canonical ordering rules."""
    measurements = puppy.get("measurements", [])
    if not isinstance(measurements, list):
        return []
    return sorted_measurements(
        measurements,
        active_only=active_only,
        newest_first=newest_first,
        copy_items=copy_items,
    )


def measurement_datetime(measurement: dict[str, Any]) -> datetime | None:
    """Return a measurement timestamp as an aware UTC datetime."""
    return parse_timestamp(measurement.get("timestamp"))
