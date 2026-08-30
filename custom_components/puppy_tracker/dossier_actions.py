"""Compatibility helpers for Puppy Tracker dossier action summaries."""

from __future__ import annotations

from datetime import date
from typing import Any

from .upcoming import (
    ACTIONABLE_RECORD_TYPES,
    DAYS_AHEAD_DEFAULT,
    STATUS_DUE_TODAY,
    STATUS_OVERDUE,
    STATUS_UPCOMING,
    upcoming_actions,
    upcoming_summary,
)

DUE_SOON_DAYS = DAYS_AHEAD_DEFAULT
STATUS_FUTURE = STATUS_UPCOMING
STATUS_SCHEDULED = STATUS_UPCOMING


def dossier_actions(
    records: list[dict[str, Any]],
    *,
    today: date | None = None,
    include_scheduled: bool = True,
) -> list[dict[str, Any]]:
    """Return derived dossier actions using the upcoming action engine."""
    days_ahead = DAYS_AHEAD_DEFAULT if include_scheduled else 7
    return upcoming_actions(records, today=today, days_ahead=days_ahead)


def dossier_action_summary(
    records: list[dict[str, Any]],
    *,
    today: date | None = None,
) -> dict[str, Any]:
    """Return the legacy action summary shape from upcoming actions."""
    actions = upcoming_actions(records, today=today)
    summary = upcoming_summary(actions)
    return {
        "open_count": summary["total_count"],
        "overdue_count": summary["overdue_count"],
        "due_today_count": summary["due_today_count"],
        "upcoming_count": summary["upcoming_count"],
        "attention_count": summary["attention_count"],
        "due_soon_count": summary["total_count"],
        "next_action": summary["next_action"],
        "actions": summary["actions"],
    }
