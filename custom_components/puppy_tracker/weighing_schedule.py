"""Per-litter age phases for planned weighing, independent of growth concerns."""

from __future__ import annotations

from datetime import datetime
import math
from typing import Any

from homeassistant.util import dt as dt_util

DEFAULT_WEIGHING_PHASES = ((10.0, 12.0), (28.0, 24.0), (42.0, 48.0), (52.5, 72.0))


class InvalidWeighingSchedule(ValueError):
    """An invalid per-litter age schedule."""


def normalize_weighing_schedule(value: Any) -> dict[str, Any] | None:
    """Keep old litters on their fixed interval; validate four editable phases."""
    if value is None:
        return None
    if not isinstance(value, dict) or not isinstance(value.get("enabled"), bool):
        raise InvalidWeighingSchedule("Invalid age-based weighing schedule")
    phases = value.get("phases")
    if not isinstance(phases, list) or len(phases) != len(DEFAULT_WEIGHING_PHASES):
        raise InvalidWeighingSchedule("A weighing schedule requires four phases")
    normalized = []
    previous = 0.0
    for phase in phases:
        if not isinstance(phase, dict):
            raise InvalidWeighingSchedule("Invalid weighing phase")
        try:
            if any(isinstance(phase.get(key), bool) for key in ("until_age_days", "interval_hours")):
                raise TypeError("Boolean phase values are not numbers")
            end = float(phase["until_age_days"])
            hours = float(phase["interval_hours"])
        except (KeyError, TypeError, ValueError) as err:
            raise InvalidWeighingSchedule("Enter an end age and weighing interval for every phase") from err
        if not math.isfinite(end) or not previous < end <= 56:
            raise InvalidWeighingSchedule("Weighing phase end ages must increase and be at most 56 days")
        if not math.isfinite(hours) or not 1 <= hours <= 168:
            raise InvalidWeighingSchedule("Weighing intervals must be between 1 and 168 hours")
        normalized.append({"until_age_days": end, "interval_hours": hours})
        previous = end
    return {"enabled": value["enabled"], "phases": normalized}


def weighing_interval(settings: dict, birth: datetime | None, now: datetime) -> dict:
    """Choose by elapsed age, with a fixed fallback when birth is unavailable."""
    try:
        schedule = normalize_weighing_schedule(settings.get("weighing_schedule"))
    except InvalidWeighingSchedule:
        # An unsupported manually edited profile must not suppress fixed monitoring.
        schedule = None
    if not schedule or not schedule.get("enabled") or birth is None:
        return {"weighing_schedule_mode": "fixed", "weighing_schedule_phase": None,
                "weighing_schedule_finished": False,
                "max_hours_between_weighings": float(settings["max_hours_between_weighings"])}
    age_days = max(0.0, (dt_util.as_utc(now) - dt_util.as_utc(birth)).total_seconds() / 86400)
    for index, phase in enumerate(schedule["phases"], 1):
        if age_days < phase["until_age_days"]:
            return {"weighing_schedule_mode": "age_based", "weighing_schedule_phase": index,
                    "weighing_schedule_finished": False, "max_hours_between_weighings": phase["interval_hours"]}
    return {"weighing_schedule_mode": "age_based", "weighing_schedule_phase": None,
            "weighing_schedule_finished": True, "max_hours_between_weighings": None}
