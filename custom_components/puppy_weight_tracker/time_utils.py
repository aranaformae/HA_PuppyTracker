"""Time helpers for Puppy Weight Tracker."""

from __future__ import annotations

from datetime import datetime

from homeassistant.util import dt as dt_util


def parse_timestamp(value: str | None) -> datetime | None:
    """Parse a stored timestamp and return an aware UTC datetime."""
    if not value:
        return None

    parsed = dt_util.parse_datetime(value)
    if parsed is None:
        return None

    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_util.DEFAULT_TIME_ZONE)

    return dt_util.as_utc(parsed)


def normalize_timestamp(
    value: str | None,
    fallback: str | None = None,
) -> str | None:
    """Normalize a timestamp to an ISO UTC value.

    Older versions stored a mix of local-offset timestamps and UTC timestamps.
    They represent valid instants, but comparing those strings lexicographically
    can produce the wrong chronological order. Normalizing avoids creating new
    mixed-format data while parsed sort keys protect existing data as well.
    """
    parsed = parse_timestamp(value)
    if parsed is None and fallback is not None:
        parsed = parse_timestamp(fallback)

    if parsed is None:
        return value or fallback

    return parsed.isoformat()


def timestamp_sort_key(value: str | None) -> float:
    """Return a timezone-safe numeric sort key for a timestamp."""
    parsed = parse_timestamp(value)
    if parsed is None:
        return float("-inf")
    return parsed.timestamp()
