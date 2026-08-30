"""Regression tests for derived Puppy Tracker dossier follow-up actions."""

from __future__ import annotations

from datetime import date

from custom_components.puppy_tracker.dossier_actions import (
    STATUS_DUE_TODAY,
    STATUS_OVERDUE,
    STATUS_SCHEDULED,
    STATUS_UPCOMING,
    dossier_action_summary,
    dossier_actions,
)
from custom_components.puppy_tracker.records import RECORD_SCOPE_PUPPY


def _record(
    record_id: str,
    record_type: str,
    occurred_at: str,
    *,
    due_date: str | None,
    deleted: bool = False,
) -> dict:
    data = {}
    if due_date is not None:
        data["next_due_date"] = due_date
    return {
        "id": record_id,
        "type": record_type,
        "scope": RECORD_SCOPE_PUPPY,
        "litter_id": "litter-1",
        "puppy_id": "puppy-1",
        "occurred_at": occurred_at,
        "created_at": occurred_at,
        "updated_at": occurred_at,
        "deleted": deleted,
        "deleted_at": occurred_at if deleted else None,
        "title": None,
        "note": None,
        "data": data,
    }


def test_follow_up_statuses_use_calendar_days() -> None:
    today = date(2026, 9, 10)
    records = [
        _record("vaccination", "vaccination", "2026-09-01T10:00:00+00:00", due_date="2026-09-09"),
        _record("deworming", "deworming", "2026-09-02T10:00:00+00:00", due_date="2026-09-10"),
    ]

    actions = dossier_actions(records, today=today)
    by_type = {item["record_type"]: item for item in actions}

    assert by_type["vaccination"]["status"] == STATUS_OVERDUE
    assert by_type["vaccination"]["days_until"] == -1
    assert by_type["vaccination"]["needs_attention"] is True
    assert by_type["deworming"]["status"] == STATUS_DUE_TODAY
    assert by_type["deworming"]["days_until"] == 0


def test_upcoming_and_scheduled_actions_are_distinct() -> None:
    today = date(2026, 9, 10)
    records = [
        _record("vaccination", "vaccination", "2026-09-01T10:00:00+00:00", due_date="2026-09-15"),
        _record("deworming", "deworming", "2026-09-02T10:00:00+00:00", due_date="2026-09-25"),
    ]

    actions = dossier_actions(records, today=today)
    assert [item["status"] for item in actions] == [STATUS_UPCOMING, STATUS_SCHEDULED]
    assert actions[0]["due_soon"] is True
    assert actions[1]["due_soon"] is False

    due_soon_only = dossier_actions(records, today=today, include_scheduled=False)
    assert [item["record_id"] for item in due_soon_only] == ["vaccination"]


def test_newer_same_type_record_satisfies_previous_follow_up() -> None:
    records = [
        _record("old", "vaccination", "2026-09-01T10:00:00+00:00", due_date="2026-09-20"),
        _record("new", "vaccination", "2026-09-18T10:00:00+00:00", due_date="2026-10-10"),
    ]

    actions = dossier_actions(records, today=date(2026, 9, 19))

    assert len(actions) == 1
    assert actions[0]["record_id"] == "new"
    assert actions[0]["due_date"] == "2026-10-10"


def test_newer_record_without_next_date_closes_previous_follow_up() -> None:
    records = [
        _record("old", "deworming", "2026-09-01T10:00:00+00:00", due_date="2026-09-15"),
        _record("new", "deworming", "2026-09-14T10:00:00+00:00", due_date=None),
    ]

    assert dossier_actions(records, today=date(2026, 9, 20)) == []


def test_deleted_newer_record_does_not_hide_active_schedule() -> None:
    records = [
        _record("old", "vaccination", "2026-09-01T10:00:00+00:00", due_date="2026-09-20"),
        _record("deleted", "vaccination", "2026-09-18T10:00:00+00:00", due_date=None, deleted=True),
    ]

    actions = dossier_actions(records, today=date(2026, 9, 19))
    assert [item["record_id"] for item in actions] == ["old"]


def test_malformed_due_date_is_ignored_without_guessing() -> None:
    records = [
        _record("bad", "vaccination", "2026-09-01T10:00:00+00:00", due_date="20-09-2026"),
    ]

    assert dossier_actions(records, today=date(2026, 9, 10)) == []


def test_summary_counts_and_next_action_are_consistent() -> None:
    records = [
        _record("overdue", "vaccination", "2026-09-01T10:00:00+00:00", due_date="2026-09-09"),
        _record("upcoming", "deworming", "2026-09-02T10:00:00+00:00", due_date="2026-09-14"),
    ]

    summary = dossier_action_summary(records, today=date(2026, 9, 10))

    assert summary["open_count"] == 2
    assert summary["overdue_count"] == 1
    assert summary["due_today_count"] == 0
    assert summary["upcoming_count"] == 1
    assert summary["attention_count"] == 1
    assert summary["due_soon_count"] == 2
    assert summary["next_action"]["record_id"] == "overdue"
