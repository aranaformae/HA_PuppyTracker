"""Derive care occurrence status from canonical puppy dossier records."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime
from typing import Any

from homeassistant.util import dt as dt_util

TERMINAL_CARE_STATUSES = {"completed", "missed"}


def _parse_datetime(value: Any) -> datetime:
    parsed = dt_util.parse_datetime(str(value or "").strip())
    if parsed is None:
        raise ValueError("scheduled_at is required")
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_util.get_default_time_zone())
    return parsed


def matching_care_result_record(
    occurrence: dict[str, Any],
    records: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Return the newest active dossier record for one exact occurrence id."""
    occurrence_id = str(occurrence.get("id") or "").strip()
    if not occurrence_id:
        return None

    matches = [
        record
        for record in records
        if isinstance(record, dict)
        and not record.get("deleted", False)
        and str((record.get("data") or {}).get("care_occurrence_id") or "") == occurrence_id
    ]
    if not matches:
        return None
    matches.sort(key=lambda record: str(record.get("occurred_at") or record.get("created_at") or ""))
    return deepcopy(matches[-1])


def care_occurrence_status(
    occurrence: dict[str, Any],
    records: list[dict[str, Any]],
    *,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Return occurrence enriched with dossier-derived completion and due status."""
    item = deepcopy(occurrence)
    record = matching_care_result_record(occurrence, records)
    if record is not None:
        data = record.get("data") or {}
        recorded_status = str(data.get("care_status") or "completed").strip().lower()
        item["status"] = recorded_status if recorded_status in TERMINAL_CARE_STATUSES else "completed"
        item["result_record_id"] = record.get("id")
        item["completed_at"] = record.get("occurred_at") or record.get("created_at")
        item["days_until_due"] = None
        return item

    scheduled = _parse_datetime(occurrence.get("scheduled_at"))
    current = now or dt_util.now()
    if current.tzinfo is None:
        current = current.replace(tzinfo=dt_util.get_default_time_zone())
    current_local = current.astimezone(scheduled.tzinfo)
    days_until = (scheduled.date() - current_local.date()).days

    item["days_until_due"] = days_until
    item["result_record_id"] = None
    item["completed_at"] = None
    if days_until < 0:
        item["status"] = "overdue"
    elif days_until == 0:
        item["status"] = "due_today"
    else:
        item["status"] = "upcoming"
    return item
