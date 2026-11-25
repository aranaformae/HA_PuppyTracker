"""Puppy-owned departure planning; contacts and clinical records stay separate."""
from __future__ import annotations

from datetime import date, datetime, time
from typing import Any

from homeassistant.util import dt as dt_util

from .records import create_record
from .time_utils import parse_timestamp

CHECKS = (
    "chip", "registration", "vaccination", "deworming", "puppy_test", "vet_check",
    "contract", "food", "passport", "report", "departure_weight",
)
STAGES = ("available", "option", "reserved")


class HandoffConflict(ValueError):
    """A concurrent puppy edit must not be overwritten."""


def normalize_handoff(value: Any = None) -> dict[str, Any]:
    """Validate portable state without depending on current contacts or time."""
    if value is None:
        value = {}
    if not isinstance(value, dict) or set(value) - {"stage", "departure_date", "checks"}:
        raise ValueError("Invalid handoff data")
    stage = value.get("stage", "available")
    if stage not in STAGES:
        raise ValueError("Invalid handoff stage")
    departure = value.get("departure_date")
    if departure == "":
        departure = None
    if departure is not None:
        if not isinstance(departure, str):
            raise ValueError("Invalid departure date")
        try:
            if date.fromisoformat(departure).isoformat() != departure:
                raise ValueError
        except ValueError as err:
            raise ValueError("Invalid departure date") from err
    checks = value.get("checks", {})
    if not isinstance(checks, dict) or set(checks) - set(CHECKS) or any(type(v) is not bool for v in checks.values()):
        raise ValueError("Invalid handoff checklist")
    return {"stage": stage, "departure_date": departure,
            "checks": {key: checks.get(key, False) for key in CHECKS}}


def handoff_summary(puppy: dict[str, Any]) -> dict[str, Any]:
    """Build a privacy-safe current view; assignment follows existing links."""
    state = normalize_handoff(puppy.get("handoff"))
    missing = [key for key in CHECKS if not state["checks"][key]]
    return {**state,
            "status": "departed" if state["departure_date"] else "assigned" if puppy.get("owner_ids") else state["stage"],
            "assigned": bool(puppy.get("owner_ids")),
            "completed_count": len(CHECKS) - len(missing), "total_count": len(CHECKS),
            "missing": missing, "ready": not missing}


def handoff_departure_record(
    litter_id: str, puppy_id: str, puppy: dict[str, Any],
) -> dict[str, Any] | None:
    """Derive one read-only milestone from the authoritative departure date."""
    departure = (puppy.get("handoff") or {}).get("departure_date")
    if not departure:
        return None
    local = datetime.combine(date.fromisoformat(departure), time(12), dt_util.DEFAULT_TIME_ZONE)
    record = create_record(litter_id=litter_id, puppy_id=puppy_id, record_type="milestone",
                           occurred_at=local.isoformat(), now=puppy.get("updated_at"),
                           data={})
    record.update(id=f"handoff:{puppy_id}", generated="handoff_departure")
    return record


def validate_departure(
    state: dict[str, Any], puppy: dict[str, Any], litter: dict[str, Any],
    *, confirm_incomplete: bool = False,
) -> None:
    """Validate a write; backups retain historical dates unchanged."""
    departure = state["departure_date"]
    if not departure:
        return
    day = date.fromisoformat(departure)
    birth = parse_timestamp(puppy.get("birth_time"))
    birth_day = dt_util.as_local(birth).date() if birth else date.fromisoformat(litter["birth_date"]) if litter.get("birth_date") else None
    if day > dt_util.now().date() or (birth_day and day < birth_day):
        raise ValueError("Departure date must be between birth and today")
    if not all(state["checks"].values()) and not confirm_incomplete:
        raise ValueError("Confirm departure with an incomplete checklist")
