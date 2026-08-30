"""Derived upcoming actions for Puppy Tracker dossier records."""

from __future__ import annotations

from copy import deepcopy
from datetime import date
from typing import Any

from homeassistant.util import dt as dt_util

DAYS_AHEAD_DEFAULT = 30

ACTIONABLE_RECORD_TYPES: dict[str, dict[str, str]] = {
    "vaccination": {
        "due_field": "next_due_date",
        "title": "Vaccinatie",
        "icon": "mdi:needle",
    },
    "deworming": {
        "due_field": "next_due_date",
        "title": "Ontworming",
        "icon": "mdi:shield-bug-outline",
    },
}

STATUS_OVERDUE = "overdue"
STATUS_DUE_TODAY = "due_today"
STATUS_UPCOMING = "upcoming"

_STATUS_ORDER = {
    STATUS_OVERDUE: 0,
    STATUS_DUE_TODAY: 1,
    STATUS_UPCOMING: 2,
}


def local_today() -> date:
    """Return the Home Assistant local calendar date."""
    return dt_util.now().date()


def _parse_due_date(value: Any) -> date | None:
    """Parse an ISO calendar date without timezone conversion."""
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip())
    except ValueError:
        return None


def _status_for_days(days_until_due: int) -> str:
    """Return the public due status for a date distance."""
    if days_until_due < 0:
        return STATUS_OVERDUE
    if days_until_due == 0:
        return STATUS_DUE_TODAY
    return STATUS_UPCOMING


def upcoming_actions(
    records: list[dict[str, Any]],
    *,
    today: date | None = None,
    days_ahead: int | None = DAYS_AHEAD_DEFAULT,
    include_overdue: bool = True,
    litter_id: str | None = None,
    puppy_id: str | None = None,
) -> list[dict[str, Any]]:
    """Derive upcoming actions from active dossier records.

    Dossier records remain the source of truth. This function reads supported
    due-date fields from active records and returns transient actions without
    storing or mutating anything.
    """
    current_date = today or local_today()
    max_days = DAYS_AHEAD_DEFAULT if days_ahead is None else max(0, int(days_ahead))
    actions: list[dict[str, Any]] = []

    for record in records:
        if not isinstance(record, dict) or record.get("deleted", False):
            continue
        if litter_id is not None and record.get("litter_id") != litter_id:
            continue
        if puppy_id is not None and record.get("puppy_id") != puppy_id:
            continue

        record_type = str(record.get("type") or "")
        config = ACTIONABLE_RECORD_TYPES.get(record_type)
        data = record.get("data")
        if config is None or not isinstance(data, dict):
            continue

        due_date = _parse_due_date(data.get(config["due_field"]))
        if due_date is None:
            continue

        days_until_due = (due_date - current_date).days
        if days_until_due < 0 and not include_overdue:
            continue
        if days_until_due > max_days:
            continue

        due_date_iso = due_date.isoformat()
        source_record_id = record.get("id")
        action_title = str(config["title"])
        source_title = record.get("title")
        description_parts = [str(source_title)] if source_title else []
        if record.get("puppy_name"):
            description_parts.append(str(record["puppy_name"]))

        actions.append(
            {
                "id": f"{source_record_id or ''}:{config['due_field']}",
                "source_record_id": source_record_id,
                "record_id": source_record_id,
                "litter_id": record.get("litter_id"),
                "puppy_id": record.get("puppy_id"),
                "puppy_name": record.get("puppy_name"),
                "scope": record.get("scope"),
                "type": record_type,
                "category": record_type,
                "record_type": record_type,
                "title": action_title,
                "label": action_title,
                "description": " - ".join(description_parts),
                "icon": config["icon"],
                "due_field": config["due_field"],
                "due_at": due_date_iso,
                "due_date": due_date_iso,
                "days_until_due": days_until_due,
                "days_until": days_until_due,
                "status": _status_for_days(days_until_due),
                "needs_attention": days_until_due <= 0,
                "due_soon": True,
                "source_title": source_title,
                "source_occurred_at": record.get("occurred_at"),
            }
        )

    actions.sort(key=upcoming_action_sort_key)
    return deepcopy(actions)


def upcoming_action_sort_key(action: dict[str, Any]) -> tuple[int, str, str, str]:
    """Return deterministic status-first chronological sorting."""
    return (
        _STATUS_ORDER.get(str(action.get("status") or ""), 99),
        str(action.get("due_at") or action.get("due_date") or ""),
        str(action.get("source_occurred_at") or ""),
        str(action.get("source_record_id") or action.get("record_id") or ""),
    )


def upcoming_summary(actions: list[dict[str, Any]]) -> dict[str, Any]:
    """Return compact counts for derived upcoming actions."""
    overdue = [item for item in actions if item.get("status") == STATUS_OVERDUE]
    due_today = [item for item in actions if item.get("status") == STATUS_DUE_TODAY]
    upcoming = [item for item in actions if item.get("status") == STATUS_UPCOMING]

    return {
        "open_count": len(actions),
        "upcoming_count": len(upcoming),
        "overdue_count": len(overdue),
        "due_today_count": len(due_today),
        "total_count": len(actions),
        "attention_count": len(overdue) + len(due_today),
        "due_soon_count": len(actions),
        "next_action": deepcopy(actions[0]) if actions else None,
        "actions": deepcopy(actions),
    }
