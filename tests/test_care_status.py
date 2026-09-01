from __future__ import annotations

from datetime import datetime, timezone

from custom_components.puppy_tracker.care_status import care_occurrence_status


def _occurrence() -> dict:
    return {
        "id": "ens:pup-1:7",
        "program_id": "ens",
        "puppy_id": "pup-1",
        "scheduled_at": "2026-09-09T09:00:00+02:00",
        "time_of_day": "09:00",
    }


def test_clocked_occurrence_is_upcoming_before_due_time_same_day() -> None:
    now = datetime(2026, 9, 9, 6, 30, tzinfo=timezone.utc)
    item = care_occurrence_status(_occurrence(), [], now=now)
    assert item["status"] == "upcoming"
    assert item["days_until_due"] == 0


def test_clocked_occurrence_becomes_due_today_at_due_time() -> None:
    now = datetime(2026, 9, 9, 7, 0, tzinfo=timezone.utc)
    item = care_occurrence_status(_occurrence(), [], now=now)
    assert item["status"] == "due_today"
    assert item["days_until_due"] == 0


def test_open_occurrence_remains_due_today_after_due_time() -> None:
    now = datetime(2026, 9, 9, 12, 0, tzinfo=timezone.utc)
    item = care_occurrence_status(_occurrence(), [], now=now)
    assert item["status"] == "due_today"
    assert item["days_until_due"] == 0


def test_past_occurrence_is_overdue_without_shifting_schedule() -> None:
    now = datetime(2026, 9, 11, 12, 0, tzinfo=timezone.utc)
    item = care_occurrence_status(_occurrence(), [], now=now)
    assert item["status"] == "overdue"
    assert item["days_until_due"] == -2
    assert item["id"] == "ens:pup-1:7"


def test_unclocked_occurrence_is_due_for_whole_calendar_day() -> None:
    occurrence = _occurrence()
    occurrence["time_of_day"] = None
    now = datetime(2026, 9, 9, 4, 0, tzinfo=timezone.utc)
    item = care_occurrence_status(occurrence, [], now=now)
    assert item["status"] == "due_today"
    assert item["days_until_due"] == 0


def test_exact_dossier_occurrence_marks_completed() -> None:
    record = {
        "id": "record-1",
        "occurred_at": "2026-09-09T10:00:00+02:00",
        "deleted": False,
        "data": {
            "care_occurrence_id": "ens:pup-1:7",
            "care_status": "completed",
        },
    }
    item = care_occurrence_status(_occurrence(), [record])
    assert item["status"] == "completed"
    assert item["result_record_id"] == "record-1"
    assert item["completed_at"] == record["occurred_at"]


def test_other_puppy_or_deleted_record_does_not_complete_occurrence() -> None:
    records = [
        {"id": "wrong", "deleted": False, "data": {"care_occurrence_id": "ens:pup-2:7", "care_status": "completed"}},
        {"id": "deleted", "deleted": True, "data": {"care_occurrence_id": "ens:pup-1:7", "care_status": "completed"}},
    ]
    item = care_occurrence_status(_occurrence(), records, now=datetime(2026, 9, 11, 12, 0, tzinfo=timezone.utc))
    assert item["status"] == "overdue"
    assert item["result_record_id"] is None
