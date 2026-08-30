"""Canonical weight, growth, and monitoring metrics for Puppy Tracker."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.util import dt as dt_util

from .const import (
    DEFAULT_GROWTH_MONITORING_DAYS,
    DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
    DEFAULT_MIN_DAILY_GROWTH_PERCENT,
    FIRST_DAY_GRACE_HOURS,
    FIRST_DAY_MAX_WEIGHT_LOSS_PERCENT,
    MIN_GROWTH_SAMPLE_HOURS,
)
from .measurements import measurement_datetime
from .storage import PuppyTrackerStorage
from .time_utils import parse_timestamp


def finite_number(value: Any) -> float | None:
    """Return a finite float when possible."""
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None

    if result != result or result in (float("inf"), float("-inf")):
        return None

    return result


def active_measurements(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> list[dict[str, Any]]:
    """Return effective measurements in chronological order."""
    if storage.get_puppy(litter_id, puppy_id) is None:
        return []

    try:
        return storage.get_active_measurements(litter_id, puppy_id)
    except ValueError:
        return []


def measurement_series(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> list[tuple[datetime, dict[str, Any]]]:
    """Return active measurements paired with parsed timestamps."""
    result: list[tuple[datetime, dict[str, Any]]] = []

    for measurement in active_measurements(storage, litter_id, puppy_id):
        measured_at = measurement_datetime(measurement)
        if measured_at is None:
            continue
        result.append((measured_at, measurement))

    result.sort(key=lambda item: item[0])
    return result


def birth_datetime(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> datetime | None:
    """Return a puppy's parsed birth datetime."""
    puppy = storage.get_puppy(litter_id, puppy_id)
    if puppy is None:
        return None
    return parse_timestamp(puppy.get("birth_time"))


def current_weight(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> float | None:
    """Return the latest effective weight."""
    measurements = active_measurements(storage, litter_id, puppy_id)
    if not measurements:
        return None
    return finite_number(measurements[-1].get("weight"))


def previous_weight(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> float | None:
    """Return the previous effective weight."""
    measurements = active_measurements(storage, litter_id, puppy_id)
    if len(measurements) < 2:
        return None
    return finite_number(measurements[-2].get("weight"))


def weight_change(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> float | None:
    """Return the difference between the two latest effective weights."""
    measurements = active_measurements(storage, litter_id, puppy_id)
    if len(measurements) < 2:
        return None

    latest = finite_number(measurements[-1].get("weight"))
    previous = finite_number(measurements[-2].get("weight"))
    if latest is None or previous is None:
        return None

    return round(latest - previous, 1)


def growth_since_birth_percent(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> float | None:
    """Return percentage growth from birth weight to current weight."""
    puppy = storage.get_puppy(litter_id, puppy_id)
    if puppy is None:
        return None

    birth_weight = finite_number(puppy.get("birth_weight"))
    if birth_weight is None or birth_weight <= 0:
        return None

    latest_weight = current_weight(storage, litter_id, puppy_id)
    if latest_weight is None:
        return None

    return round((latest_weight - birth_weight) / birth_weight * 100, 2)


def daily_growth_data(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> dict[str, Any] | None:
    """Calculate normalized growth over 24 hours."""
    series = measurement_series(storage, litter_id, puppy_id)
    if len(series) < 2:
        return None

    latest_time, latest = series[-1]
    target_time = latest_time - timedelta(hours=24)

    candidates: list[tuple[float, float, datetime, dict[str, Any]]] = []
    for measured_at, measurement in series[:-1]:
        interval_hours = (latest_time - measured_at).total_seconds() / 3600
        if interval_hours < MIN_GROWTH_SAMPLE_HOURS:
            continue

        distance = abs((measured_at - target_time).total_seconds())
        candidates.append((distance, interval_hours, measured_at, measurement))

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0])
    _distance, interval_hours, baseline_time, baseline = candidates[0]

    baseline_weight = finite_number(baseline.get("weight"))
    latest_weight = finite_number(latest.get("weight"))
    if baseline_weight is None or latest_weight is None or baseline_weight <= 0:
        return None

    actual_change = latest_weight - baseline_weight
    factor = 24.0 / interval_hours
    daily_change = actual_change * factor
    actual_percent = actual_change / baseline_weight * 100
    daily_percent = actual_percent * factor

    return {
        "daily_change_grams": round(daily_change, 1),
        "daily_change_percent": round(daily_percent, 2),
        "actual_change_grams": round(actual_change, 1),
        "sample_interval_hours": round(interval_hours, 2),
        "baseline_weight": baseline_weight,
        "current_weight": latest_weight,
        "baseline_time": baseline_time.isoformat(),
        "latest_time": latest_time.isoformat(),
    }


def last_weighed(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> datetime | None:
    """Return the timestamp of the latest effective measurement."""
    series = measurement_series(storage, litter_id, puppy_id)
    return series[-1][0] if series else None


def calculate_puppy_status(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> dict[str, Any]:
    """Return the canonical monitoring status for one puppy."""
    settings = storage.get_settings()

    min_growth = float(
        settings.get("min_daily_growth_percent", DEFAULT_MIN_DAILY_GROWTH_PERCENT)
    )
    max_hours = float(
        settings.get(
            "max_hours_between_weighings",
            DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
        )
    )
    monitoring_days = int(
        settings.get("growth_monitoring_days", DEFAULT_GROWTH_MONITORING_DAYS)
    )

    result: dict[str, Any] = {
        "status": "Geen meting",
        "status_code": "no_measurement",
        "needs_attention": True,
        "weight_loss": False,
        "hours_since_weighing": None,
        "daily_growth_percent": None,
        "daily_growth_grams": None,
        "daily_growth_sample_hours": None,
        "first_day_weight_change_percent": None,
        "growth_check_active": False,
        "min_daily_growth_percent": min_growth,
        "max_hours_between_weighings": max_hours,
        "growth_monitoring_days": monitoring_days,
    }

    series = measurement_series(storage, litter_id, puppy_id)
    if not series:
        return result

    latest_time, latest = series[-1]
    now = dt_util.now()
    hours_since = max(0, (now - latest_time).total_seconds() / 3600)
    result["hours_since_weighing"] = round(hours_since, 1)

    growth = daily_growth_data(storage, litter_id, puppy_id)
    if growth is not None:
        result["daily_growth_percent"] = growth["daily_change_percent"]
        result["daily_growth_grams"] = growth["daily_change_grams"]
        result["daily_growth_sample_hours"] = growth["sample_interval_hours"]

    birth = birth_datetime(storage, litter_id, puppy_id)
    age_hours = (now - birth).total_seconds() / 3600 if birth is not None else None

    current = finite_number(latest.get("weight"))
    puppy = storage.get_puppy(litter_id, puppy_id) or {}
    birth_weight = finite_number(puppy.get("birth_weight"))

    if hours_since >= max_hours:
        result.update(
            {
                "status": "Wegen",
                "status_code": "weigh_due",
                "needs_attention": True,
            }
        )
        return result

    if age_hours is not None and 0 <= age_hours < FIRST_DAY_GRACE_HOURS:
        if current is not None and birth_weight is not None and birth_weight > 0:
            change = (current - birth_weight) / birth_weight * 100
            result["first_day_weight_change_percent"] = round(change, 2)

            if change < -FIRST_DAY_MAX_WEIGHT_LOSS_PERCENT:
                result.update(
                    {
                        "status": "Aandacht",
                        "status_code": "first_day_excess_weight_loss",
                        "needs_attention": True,
                        "weight_loss": True,
                    }
                )
                return result

        result.update(
            {
                "status": "Eerste 24 uur",
                "status_code": "first_24h",
                "needs_attention": False,
            }
        )
        return result

    measurements = active_measurements(storage, litter_id, puppy_id)
    if current is not None and len(measurements) >= 2:
        previous = finite_number(measurements[-2].get("weight"))
        if previous is not None and current < previous:
            result.update(
                {
                    "status": "Gewichtsverlies",
                    "status_code": "weight_loss",
                    "needs_attention": True,
                    "weight_loss": True,
                }
            )
            return result

    if (
        age_hours is not None
        and age_hours >= FIRST_DAY_GRACE_HOURS
        and age_hours <= monitoring_days * 24
    ):
        result["growth_check_active"] = True
        if growth is not None and growth["daily_change_percent"] < min_growth:
            result.update(
                {
                    "status": "Lage groei",
                    "status_code": "low_growth",
                    "needs_attention": True,
                }
            )
            return result

    result.update(
        {
            "status": "OK",
            "status_code": "ok",
            "needs_attention": False,
        }
    )
    return result


def calculate_puppy_metrics(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> dict[str, Any]:
    """Return canonical current weight, growth, and monitoring metrics."""
    measurements = active_measurements(storage, litter_id, puppy_id)
    latest = measurements[-1] if measurements else None
    previous = measurements[-2] if len(measurements) >= 2 else None

    latest_weight = finite_number(latest.get("weight")) if latest else None
    previous_value = finite_number(previous.get("weight")) if previous else None
    change = (
        round(latest_weight - previous_value, 1)
        if latest_weight is not None and previous_value is not None
        else None
    )

    puppy = storage.get_puppy(litter_id, puppy_id) or {}
    birth_weight = finite_number(puppy.get("birth_weight"))
    growth_birth = (
        round((latest_weight - birth_weight) / birth_weight * 100, 2)
        if latest_weight is not None and birth_weight is not None and birth_weight > 0
        else None
    )

    status = calculate_puppy_status(storage, litter_id, puppy_id)

    return {
        "current_weight": latest_weight,
        "previous_weight": previous_value,
        "change_grams": change,
        "growth_birth_percent": growth_birth,
        "growth_24h_percent": status.get("daily_growth_percent"),
        "growth_24h_grams": status.get("daily_growth_grams"),
        "last_weighed": latest.get("timestamp") if latest else None,
        "latest_measurement_id": latest.get("id") if latest else None,
        "measurement_count": len(measurements),
        "status": status.get("status", "Onbekend"),
        "status_code": status.get("status_code", "unknown"),
        "needs_attention": bool(status.get("needs_attention", False)),
        "weight_loss": bool(status.get("weight_loss", False)),
        "hours_since_weighing": status.get("hours_since_weighing"),
        "first_day_weight_change_percent": status.get(
            "first_day_weight_change_percent"
        ),
        "growth_check_active": bool(status.get("growth_check_active", False)),
    }
