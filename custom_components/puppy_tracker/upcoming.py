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
    "test": {
        "due_field": "next_due_date",
        "title": "Test / uitslag",
        "icon": "mdi:test-tube",
    },
    "vet_visit": {
        "due_field": "next_due_date",
        "title": "Dierenartsbezoek",
        "icon": "mdi:stethoscope",
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


def _owner_key(record: dict[str, Any]) -> tuple:
    return tuple(record.get(key) for key in ("litter_id", "scope", "puppy_id", "mother_id"))


def completed_followups(records: list[dict[str, Any]]) -> set[tuple]:
    """Identify completed due dates using active facts from the same owner."""
    completed = set()
    for record in records:
        if not isinstance(record, dict) or record.get("deleted"):
            continue
        data = record.get("data")
        if not isinstance(data, dict):
            continue
        source_id = data.get("followup_record_id")
        due_date = _parse_due_date(data.get("followup_due_date"))
        if isinstance(source_id, str) and source_id and due_date:
            completed.add((_owner_key(record), record.get("type"), source_id, due_date.isoformat()))
    return completed


def followup_record_data(
    records: list[dict[str, Any]],
    record_type: str,
    source_id: str | None,
    due_date: str | None,
    data: dict[str, Any] | None,
    *,
    litter_id: str,
) -> dict[str, Any]:
    """Validate a completion under the storage lock and attach its provenance."""
    result = deepcopy(data) if isinstance(data, dict) else {}
    if source_id is None and due_date is None:
        return result
    if not source_id or not _parse_due_date(due_date):
        raise ValueError("Select a source record and valid follow-up date")
    source = next((record for record in records if isinstance(record, dict) and record.get("id") == source_id), None)
    if source is None or source.get("deleted"):
        raise ValueError("The source record no longer exists. Refresh the card")
    if source.get("litter_id") != litter_id:
        raise ValueError("The follow-up belongs to another litter")
    if record_type not in ACTIONABLE_RECORD_TYPES or source.get("type") != record_type:
        raise ValueError("The follow-up must keep the source record type")
    source_data = source.get("data")
    due_field = ACTIONABLE_RECORD_TYPES[record_type]["due_field"]
    if not isinstance(source_data, dict) or source_data.get(due_field) != due_date:
        raise ValueError("The follow-up date has changed. Refresh the card")
    if (_owner_key(source), record_type, source_id, due_date) in completed_followups(records):
        raise ValueError("This follow-up has already been completed. Refresh the card")
    required = {"deworming": "product", "vaccination": "vaccine", "test": "test_name"}.get(record_type)
    if required and not str(result.get(required) or "").strip():
        raise ValueError(f"Enter the {required} for this follow-up")
    if record_type == "vet_visit" and not any(
        str(result.get(key) or "").strip() for key in ("reason", "findings", "diagnosis", "treatment")
    ):
        raise ValueError("Enter a visit reason or finding for this follow-up")
    if result.get("next_due_date") and not _parse_due_date(result["next_due_date"]):
        raise ValueError("Enter a valid next due date")
    result.update(followup_record_id=source_id, followup_due_date=due_date)
    return result


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
    completed = completed_followups(records)

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
        if (_owner_key(record), record_type, record.get("id"), due_date.isoformat()) in completed:
            continue

        days_until_due = (due_date - current_date).days
        if days_until_due < 0 and not include_overdue:
            continue
        if days_until_due > max_days:
            continue

        due_date_iso = due_date.isoformat()
        source_record_id = record.get("id")
        action_title = str(config["title"])
        source_title = record.get("title") or (
            data.get("test_name") if record_type == "test" else
            data.get("reason") if record_type == "vet_visit" else None
        )
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
