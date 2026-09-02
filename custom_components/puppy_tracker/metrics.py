"""Canonical weight, growth, and monitoring metrics for Puppy Tracker."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.util import dt as dt_util

from .const import (
    DEFAULT_LITTER_GROWTH_ANALYSIS,
    DEFAULT_GROWTH_MONITORING_DAYS,
    DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
    DEFAULT_MIN_DAILY_GROWTH_PERCENT,
    FIRST_DAY_GRACE_HOURS,
    FIRST_DAY_MAX_WEIGHT_LOSS_PERCENT,
    LITTER_GROWTH_CONTEXT_TOLERANCE_PERCENT,
    MIN_GROWTH_SAMPLE_HOURS,
    SUSPICIOUS_SINGLE_WEIGHT_CHANGE_PERCENT,
    SUSTAINED_WEIGHT_LOSS_MEASUREMENTS,
    SUSTAINED_LOW_GROWTH_SAMPLES,
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


def _litter_weight_comparison(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> dict[str, Any] | None:
    """Compare a puppy's current weight with the measured pups in its litter."""
    litter = storage.get_litter(litter_id) or {}
    puppies = litter.get("puppies") or []
    measured: list[tuple[str, float]] = []
    for candidate_key, puppy in (puppies.items() if isinstance(puppies, dict) else []):
        candidate_id = str(puppy.get("id") or candidate_key or "")
        if not candidate_id:
            continue
        weight = current_weight(storage, litter_id, candidate_id)
        if weight is not None and weight > 0:
            measured.append((candidate_id, weight))

    selected = next((weight for candidate_id, weight in measured if candidate_id == puppy_id), None)
    if selected is None or len(measured) < 2:
        return None

    ordered = sorted(weight for _candidate_id, weight in measured)
    middle = len(ordered) // 2
    median = (
        ordered[middle]
        if len(ordered) % 2
        else (ordered[middle - 1] + ordered[middle]) / 2
    )
    rank = 1 + sum(weight > selected for _candidate_id, weight in measured)
    delta_percent = (selected - median) / median * 100 if median > 0 else None
    if delta_percent is None:
        position_code = "unknown"
    elif delta_percent <= -10:
        position_code = "below_median"
    elif delta_percent >= 10:
        position_code = "above_median"
    else:
        position_code = "near_median"

    return {
        "sample_size": len(measured),
        "rank": rank,
        "median_weight": round(median, 1),
        "delta_percent": round(delta_percent, 2) if delta_percent is not None else None,
        "position_code": position_code,
    }


def _litter_growth_comparison(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> dict[str, Any] | None:
    """Compare normalized daily growth with the other measured pups."""
    litter = storage.get_litter(litter_id) or {}
    puppies = litter.get("puppies") or {}
    measured: list[tuple[str, float]] = []
    for candidate_key, puppy in (puppies.items() if isinstance(puppies, dict) else []):
        candidate_id = str(puppy.get("id") or candidate_key or "")
        growth = daily_growth_data(storage, litter_id, candidate_id) if candidate_id else None
        value = finite_number(growth.get("daily_change_percent")) if growth else None
        if value is not None:
            measured.append((candidate_id, value))

    selected = next((value for candidate_id, value in measured if candidate_id == puppy_id), None)
    if selected is None or len(measured) < 2:
        return None

    ordered = sorted(value for _candidate_id, value in measured)
    middle = len(ordered) // 2
    median = ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
    rank = 1 + sum(value > selected for _candidate_id, value in measured)
    delta = selected - median
    if delta <= -LITTER_GROWTH_CONTEXT_TOLERANCE_PERCENT:
        position_code = "below_median"
    elif delta >= LITTER_GROWTH_CONTEXT_TOLERANCE_PERCENT:
        position_code = "above_median"
    else:
        position_code = "near_median"

    return {
        "sample_size": len(measured),
        "rank": rank,
        "median_daily_growth_percent": round(median, 2),
        "delta_percentage_points": round(delta, 2),
        "position_code": position_code,
    }


def _weight_pattern(series: list[tuple[datetime, dict[str, Any]]]) -> dict[str, Any]:
    """Describe consecutive changes without treating one drop as a diagnosis."""
    changes: list[float] = []
    for (_previous_time, previous), (_current_time, current) in zip(series, series[1:]):
        previous_weight = finite_number(previous.get("weight"))
        current_weight_value = finite_number(current.get("weight"))
        if previous_weight is None or current_weight_value is None:
            continue
        changes.append(round(current_weight_value - previous_weight, 1))

    consecutive_loss = 0
    for change in reversed(changes):
        if change < 0:
            consecutive_loss += 1
        else:
            break

    return {
        "consecutive_loss_measurements": consecutive_loss,
        "sustained_loss": consecutive_loss >= SUSTAINED_WEIGHT_LOSS_MEASUREMENTS,
    }


def _normalized_growth_values(series: list[tuple[datetime, dict[str, Any]]]) -> list[float]:
    """Return valid interval growth values normalized to a 24-hour period."""
    values: list[float] = []
    for (previous_time, previous), (current_time, current) in zip(series, series[1:]):
        previous_weight = finite_number(previous.get("weight"))
        current_weight_value = finite_number(current.get("weight"))
        interval_hours = (current_time - previous_time).total_seconds() / 3600
        if previous_weight is None or current_weight_value is None or previous_weight <= 0 or interval_hours <= 0:
            continue
        values.append((current_weight_value - previous_weight) / previous_weight * 100 * 24 / interval_hours)
    return values


def _growth_pattern(
    series: list[tuple[datetime, dict[str, Any]]],
    minimum_percent: float,
) -> dict[str, Any]:
    """Describe consecutive normalized growth periods below the litter threshold."""
    growth_values = _normalized_growth_values(series)

    consecutive_low = 0
    for value in reversed(growth_values):
        if value < minimum_percent:
            consecutive_low += 1
        else:
            break

    return {
        "consecutive_low_growth_samples": consecutive_low,
        "sustained_low_growth": consecutive_low >= SUSTAINED_LOW_GROWTH_SAMPLES,
    }


def _growth_variability(series: list[tuple[datetime, dict[str, Any]]]) -> dict[str, Any] | None:
    """Summarize spread in normalized growth intervals for the overview."""
    values = _normalized_growth_values(series)
    if len(values) < 3:
        return None

    ordered = sorted(values)
    middle = len(ordered) // 2
    median = ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2
    deviations = sorted(abs(value - median) for value in values)
    deviation_middle = len(deviations) // 2
    mad = deviations[deviation_middle] if len(deviations) % 2 else (deviations[deviation_middle - 1] + deviations[deviation_middle]) / 2
    return {
        "sample_count": len(values),
        "minimum_daily_growth_percent": round(min(values), 2),
        "maximum_daily_growth_percent": round(max(values), 2),
        "range_percentage_points": round(max(values) - min(values), 2),
        "median_absolute_deviation": round(mad, 2),
    }


def effective_growth_settings(
    storage: PuppyTrackerStorage,
    litter_id: str,
) -> dict[str, Any]:
    """Merge per-litter growth overrides with the integration defaults."""
    litter = storage.get_litter(litter_id) or {}
    overrides = litter.get("growth_analysis") or {}
    global_settings = storage.get_settings()
    result = dict(DEFAULT_LITTER_GROWTH_ANALYSIS)
    result.update(
        {
            "min_daily_growth_percent": global_settings.get(
                "min_daily_growth_percent", DEFAULT_MIN_DAILY_GROWTH_PERCENT
            ),
            "max_hours_between_weighings": global_settings.get(
                "max_hours_between_weighings", DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS
            ),
            "growth_monitoring_days": global_settings.get(
                "growth_monitoring_days", DEFAULT_GROWTH_MONITORING_DAYS
            ),
            "first_day_max_weight_loss_percent": FIRST_DAY_MAX_WEIGHT_LOSS_PERCENT,
        }
    )
    for key in result:
        if overrides.get(key) is not None:
            result[key] = overrides[key]
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


def growth_analysis(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
) -> dict[str, Any]:
    """Return a compact, non-clinical growth analysis for one puppy."""
    settings = effective_growth_settings(storage, litter_id)
    series = measurement_series(storage, litter_id, puppy_id)
    growth = daily_growth_data(storage, litter_id, puppy_id)
    status = calculate_puppy_status(storage, litter_id, puppy_id)
    current = finite_number(series[-1][1].get("weight")) if series else None

    result: dict[str, Any] = {
        "status_code": "no_measurement" if not series else "insufficient_data",
        "status": "Geen meting" if not series else "Meer data nodig",
        "trend_code": "insufficient_data",
        "trend": "Onvoldoende data",
        "data_quality": "none" if not series else "limited",
        "measurement_count": len(series),
        "current_weight": current,
        "daily_growth_percent": growth["daily_change_percent"] if growth else None,
        "daily_growth_grams": growth["daily_change_grams"] if growth else None,
        "hours_since_weighing": status.get("hours_since_weighing"),
        "growth_check_active": bool(status.get("growth_check_active")),
        "min_daily_growth_percent": settings["min_daily_growth_percent"],
        "expected_adult_weight_min_grams": settings["expected_adult_weight_min_grams"],
        "expected_adult_weight_max_grams": settings["expected_adult_weight_max_grams"],
        "litter_comparison": _litter_weight_comparison(storage, litter_id, puppy_id),
        "litter_growth_comparison": _litter_growth_comparison(storage, litter_id, puppy_id),
        "weight_pattern": _weight_pattern(series),
        "growth_pattern": _growth_pattern(series, float(settings["min_daily_growth_percent"])),
        "growth_variability": _growth_variability(series),
        "anomaly": None,
    }

    if not series:
        return result

    if len(series) >= 3:
        previous_weight = finite_number(series[-2][1].get("weight"))
        if current is not None and previous_weight is not None and previous_weight > 0:
            change_percent = (current - previous_weight) / previous_weight * 100
            if abs(change_percent) >= SUSPICIOUS_SINGLE_WEIGHT_CHANGE_PERCENT:
                result["anomaly"] = {
                    "code": "sudden_weight_change",
                    "change_percent": round(change_percent, 2),
                    "message": "Controleer de laatste meting",
                }

    if len(series) >= 2:
        result["data_quality"] = "good" if len(series) >= 3 else "limited"

        deltas: list[float] = []
        for (previous_time, previous), (current_time, current_item) in zip(
            series,
            series[1:],
        ):
            previous_weight = finite_number(previous.get("weight"))
            current_weight = finite_number(current_item.get("weight"))
            interval_hours = (current_time - previous_time).total_seconds() / 3600
            if (
                previous_weight is not None
                and current_weight is not None
                and previous_weight > 0
                and interval_hours > 0
            ):
                deltas.append((current_weight - previous_weight) * 24 / interval_hours)

        if len(deltas) >= 2:
            recent = sum(deltas[-2:]) / 2
            earlier_values = deltas[:-2] or deltas[:1]
            earlier = sum(earlier_values) / len(earlier_values)
            difference = recent - earlier
            if difference > 1:
                result.update({"trend_code": "rising", "trend": "Stijgend"})
            elif difference < -1:
                result.update({"trend_code": "falling", "trend": "Dalend"})
            else:
                result.update({"trend_code": "stable", "trend": "Stabiel"})
        elif deltas:
            result.update({"trend_code": "stable", "trend": "Eerste trend"})

    if status.get("status_code") in {"weigh_due", "no_measurement"}:
        result.update(
            {
                "status_code": "stale",
                "status": "Weging nodig",
                "data_quality": "stale",
            }
        )
    elif status.get("status_code") in {"weight_loss", "first_day_excess_weight_loss"}:
        result.update({"status_code": "loss", "status": "Gewichtsverlies"})
    elif status.get("status_code") == "low_growth":
        result.update({"status_code": "below_threshold", "status": "Onder nestdrempel"})
    elif growth is not None:
        result.update({"status_code": "on_track", "status": "Binnen nestinstelling"})

    if result["anomaly"] is not None:
        result.update(
            {
                "status_code": "possible_input_error",
                "status": "Controleer laatste meting",
                "data_quality": "review",
            }
        )
    elif result["weight_pattern"]["sustained_loss"]:
        result.update(
            {
                "status_code": "sustained_weight_loss",
                "status": "Aanhoudend gewichtsverlies",
                "data_quality": "review",
            }
        )
    elif result["growth_pattern"]["sustained_low_growth"] and status.get("growth_check_active"):
        result.update(
            {
                "status_code": "sustained_low_growth",
                "status": "Aanhoudend lage groei",
                "data_quality": "review",
            }
        )

    return result


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
    settings = effective_growth_settings(storage, litter_id)

    min_growth = float(settings["min_daily_growth_percent"])
    max_hours = float(settings["max_hours_between_weighings"])
    monitoring_days = int(settings["growth_monitoring_days"])

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

            if change < -float(settings["first_day_max_weight_loss_percent"]):
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
        "growth_analysis": growth_analysis(storage, litter_id, puppy_id),
    }
