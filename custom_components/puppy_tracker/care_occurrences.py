"""Derive immutable age-based care occurrences per puppy."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any

from homeassistant.util import dt as dt_util


def _parse_birth_time(value: Any) -> datetime:
    parsed = dt_util.parse_datetime(str(value or "").strip())
    if parsed is None:
        raise ValueError("puppy birth_time is required")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_util.get_default_time_zone())
    return parsed


def care_program_age_days(program: dict[str, Any]) -> list[int]:
    """Return the fixed age-day schedule for one normalized care program."""
    if not program.get("enabled", True):
        return []

    start = int(program.get("start_age_days") or 0)
    schedule_type = str(program.get("schedule_type") or "")

    if schedule_type == "once":
        return [start]

    if schedule_type != "range":
        raise ValueError("schedule_type must be once or range")

    end = int(program.get("end_age_days") or start)
    interval = int(program.get("interval_days") or 1)
    if interval < 1:
        raise ValueError("interval_days must be a positive integer")
    if end < start:
        raise ValueError("end_age_days must be on or after start_age_days")
    return list(range(start, end + 1, interval))


def _scheduled_at(birth_time: datetime, age_days: int, time_of_day: str | None) -> datetime:
    if not time_of_day:
        return birth_time + timedelta(days=age_days)

    # ``birth_time`` is canonical storage data and is commonly UTC. A care
    # program clock value is entered as Home Assistant local wall time, so move
    # to HA local time before applying the requested age day and HH:MM. This
    # also lets zoneinfo apply the correct DST offset for the target date.
    target = dt_util.as_local(birth_time) + timedelta(days=age_days)
    hour, minute = (int(part) for part in time_of_day.split(":"))
    return target.replace(hour=hour, minute=minute, second=0, microsecond=0)


def _occurrence_id(program_id: str, revision: int, puppy_id: str, age_days: int) -> str:
    """Return a backward-compatible deterministic occurrence identity."""
    if revision <= 1:
        # v0.17.0 results already persist this format in dossier records.
        return f"{program_id}:{puppy_id}:{age_days}"
    return f"{program_id}:r{revision}:{puppy_id}:{age_days}"


def derive_puppy_care_occurrences(
    program: dict[str, Any],
    puppy: dict[str, Any],
) -> list[dict[str, Any]]:
    """Derive deterministic occurrences for one puppy and care program.

    Occurrences are schedule facts only. They intentionally contain no completion
    or notification-delivery state; later layers may enrich them from dossier data.
    """
    if not program.get("enabled", True):
        return []

    program_id = str(program.get("id") or "").strip()
    litter_id = str(program.get("litter_id") or "").strip()
    puppy_id = str(puppy.get("id") or "").strip()
    revision = int(program.get("revision") or 1)
    if not program_id:
        raise ValueError("program id is required")
    if not litter_id:
        raise ValueError("litter_id is required")
    if not puppy_id:
        raise ValueError("puppy id is required")
    if revision < 1:
        raise ValueError("program revision must be a positive integer")

    birth_time = _parse_birth_time(puppy.get("birth_time"))
    puppy_name = str(puppy.get("name") or "").strip() or None
    result_fields = list(program.get("result_fields") or [])
    time_of_day = str(program.get("time_of_day") or "").strip() or None

    occurrences: list[dict[str, Any]] = []
    for age_days in care_program_age_days(program):
        scheduled = _scheduled_at(birth_time, age_days, time_of_day)
        occurrences.append({
            "id": _occurrence_id(program_id, revision, puppy_id, age_days),
            "program_id": program_id,
            "program_revision": revision,
            "litter_id": litter_id,
            "puppy_id": puppy_id,
            "puppy_name": puppy_name,
            "title": str(program.get("title") or ""),
            "description": program.get("description"),
            "counts_for_attention": bool(program.get("counts_for_attention", True)),
            "record_type": str(program.get("record_type") or "note"),
            "age_days": age_days,
            "scheduled_at": scheduled.isoformat(),
            "scheduled_date": scheduled.date().isoformat(),
            "time_of_day": time_of_day,
            "notifications_enabled": bool(program.get("notifications_enabled", True)),
            "notification_lead_minutes": program.get("notification_lead_minutes"),
            "result_fields": deepcopy(result_fields),
        })
    return occurrences


def derive_litter_care_occurrences(
    program: dict[str, Any],
    puppies: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Derive all occurrences for active puppies in one litter."""
    items: list[dict[str, Any]] = []
    for puppy in puppies:
        if puppy.get("active", True) is False:
            continue
        items.extend(derive_puppy_care_occurrences(program, puppy))
    return sorted(items, key=lambda item: (item["scheduled_at"], item["puppy_id"]))
