"""Derived follow-up actions for Puppy Tracker dossier records."""

from __future__ import annotations

from copy import deepcopy
from datetime import date
from typing import Any

from .records import sorted_records

DUE_SOON_DAYS = 7

# A follow-up date belongs to the latest active record of its type. A newer
# record without a next_due_date intentionally closes the previous follow-up.
ACTIONABLE_RECORD_TYPES: dict[str, dict[str, str]] = {
    "vaccination": {
        "due_field": "next_due_date",
        "label": "Vaccinatie",
        "icon": "mdi:needle",
    },
    "deworming": {
        "due_field": "next_due_date",
        "label": "Ontworming",
        "icon": "mdi:shield-bug-outline",
    },
}

STATUS_OVERDUE = "overdue"
STATUS_DUE_TODAY = "due_today"
STATUS_UPCOMING = "upcoming"
STATUS_SCHEDULED = "scheduled"


def _parse_due_date(value: Any) -> date | None:
    """Parse an ISO calendar date without guessing malformed values."""
    if not isinstance(value, str):
        return None
    try:
        return date.fromisoformat(value.strip())
    except (TypeError, ValueError):
        return None


def _status_for_days(days_until: int) -> str:
    """Return the derived follow-up status for a date distance."""
    if days_until < 0:
        return STATUS_OVERDUE
    if days_until == 0:
        return STATUS_DUE_TODAY
    if days_until <= DUE_SOON_DAYS:
        return STATUS_UPCOMING
    return STATUS_SCHEDULED


def dossier_actions(
    records: list[dict[str, Any]],
    *,
    today: date | None = None,
    include_scheduled: bool = True,
) -> list[dict[str, Any]]:
    """Return current follow-up actions derived from dossier records.

    Only the newest active record for each actionable type is authoritative.
    This means a later vaccination or deworming record automatically satisfies
    the follow-up date stored on the previous record. If the newest record has
    no next due date, that action type has no open follow-up.
    """
    current_date = today or date.today()
    newest = sorted_records(
        records,
        include_deleted=False,
        newest_first=True,
        copy_items=False,
    )

    seen_types: set[str] = set()
    actions: list[dict[str, Any]] = []

    for record in newest:
        record_type = str(record.get("type") or "")
        config = ACTIONABLE_RECORD_TYPES.get(record_type)
        if config is None or record_type in seen_types:
            continue
        seen_types.add(record_type)

        data = record.get("data")
        if not isinstance(data, dict):
            continue

        due_date = _parse_due_date(data.get(config["due_field"]))
        if due_date is None:
            continue

        days_until = (due_date - current_date).days
        status = _status_for_days(days_until)
        if status == STATUS_SCHEDULED and not include_scheduled:
            continue

        actions.append(
            {
                "id": f"{record.get('id') or ''}:{config['due_field']}",
                "record_id": record.get("id"),
                "record_type": record_type,
                "scope": record.get("scope"),
                "litter_id": record.get("litter_id"),
                "puppy_id": record.get("puppy_id"),
                "label": config["label"],
                "icon": config["icon"],
                "due_field": config["due_field"],
                "due_date": due_date.isoformat(),
                "days_until": days_until,
                "status": status,
                "needs_attention": status in {STATUS_OVERDUE, STATUS_DUE_TODAY},
                "due_soon": status in {
                    STATUS_OVERDUE,
                    STATUS_DUE_TODAY,
                    STATUS_UPCOMING,
                },
                "source_title": record.get("title"),
                "source_occurred_at": record.get("occurred_at"),
            }
        )

    actions.sort(
        key=lambda item: (
            str(item.get("due_date") or ""),
            str(item.get("label") or ""),
            str(item.get("record_id") or ""),
        )
    )
    return deepcopy(actions)


def dossier_action_summary(
    records: list[dict[str, Any]],
    *,
    today: date | None = None,
) -> dict[str, Any]:
    """Return compact counts plus the next derived dossier action."""
    actions = dossier_actions(records, today=today, include_scheduled=True)
    overdue = [item for item in actions if item["status"] == STATUS_OVERDUE]
    due_today = [item for item in actions if item["status"] == STATUS_DUE_TODAY]
    upcoming = [item for item in actions if item["status"] == STATUS_UPCOMING]

    return {
        "open_count": len(actions),
        "overdue_count": len(overdue),
        "due_today_count": len(due_today),
        "upcoming_count": len(upcoming),
        "attention_count": len(overdue) + len(due_today),
        "due_soon_count": len(overdue) + len(due_today) + len(upcoming),
        "next_action": deepcopy(actions[0]) if actions else None,
        "actions": actions,
    }
