from __future__ import annotations

from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from custom_components.puppy_tracker.recurring_reminders import (
    next_due_at,
    normalize_reminder,
    reminder_matches_record,
    reminder_status,
)

ROOT = Path(__file__).resolve().parents[1]


def test_interval_reminder_runs_from_last_completion() -> None:
    reminder = normalize_reminder({
        "owner_scope": "mother",
        "owner_id": "mother-1",
        "litter_id": "litter-1",
        "title": "Temperatuur meten",
        "record_type": "temperature",
        "schedule_mode": "interval",
        "interval_minutes": 240,
        "start_at": "2026-08-31T08:00:00+02:00",
        "last_completed_at": "2026-08-31T12:37:00+02:00",
    })
    due = next_due_at(reminder, now=datetime(2026, 8, 31, 13, 0, tzinfo=ZoneInfo("Europe/Amsterdam")))
    assert due is not None
    assert due.isoformat() == "2026-08-31T16:37:00+02:00"


def test_owner_scope_is_part_of_matching_contract() -> None:
    reminder = normalize_reminder({
        "owner_scope": "puppy",
        "owner_id": "pup-1",
        "litter_id": "litter-1",
        "title": "Temperatuur meten",
        "record_type": "temperature",
        "schedule_mode": "interval",
        "interval_minutes": 240,
    })
    assert reminder["owner_scope"] == "puppy"
    assert reminder["owner_id"] == "pup-1"
    assert reminder_matches_record(reminder, {"type": "temperature", "data": {"temperature_c": 38.4}})
    assert not reminder_matches_record(reminder, {"type": "medication"})


def test_litter_scope_uses_litter_as_owner_id() -> None:
    reminder = normalize_reminder({
        "owner_scope": "litter",
        "owner_id": "ignored",
        "litter_id": "litter-1",
        "title": "Werpkist controleren",
        "record_type": "note",
        "match_title": "Werpkist gecontroleerd",
        "schedule_mode": "interval",
        "interval_minutes": 120,
    })
    assert reminder["owner_id"] == "litter-1"
    assert reminder_matches_record(reminder, {"type": "note", "title": "Werpkist gecontroleerd"})
    assert not reminder_matches_record(reminder, {"type": "note", "title": "Andere notitie"})


def test_fixed_times_and_one_time_schedules() -> None:
    fixed = normalize_reminder({
        "owner_scope": "litter",
        "litter_id": "litter-1",
        "title": "Voeren",
        "record_type": "note",
        "schedule_mode": "fixed_times",
        "fixed_times": ["08:00", "14:00", "20:00"],
    })
    due = next_due_at(fixed, now=datetime(2026, 8, 31, 13, 0, tzinfo=ZoneInfo("Europe/Amsterdam")))
    assert due is not None
    assert due.hour == 14

    once = normalize_reminder({
        "owner_scope": "mother",
        "owner_id": "mother-1",
        "litter_id": "litter-1",
        "title": "Controle",
        "record_type": "note",
        "schedule_mode": "once",
        "due_at": "2026-08-31T17:00:00+02:00",
    })
    status = reminder_status(once, now=datetime(2026, 8, 31, 18, 0, tzinfo=ZoneInfo("Europe/Amsterdam")))
    assert status["status"] == "overdue"


def test_frontend_exposes_reminder_card_and_all_owner_scopes() -> None:
    frontend = (ROOT / "custom_components" / "puppy_tracker" / "frontend.py").read_text(encoding="utf-8")
    source = (ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-recurring-reminder-card.js").read_text(encoding="utf-8")
    api = (ROOT / "custom_components" / "puppy_tracker" / "recurring_reminder_api.py").read_text(encoding="utf-8")

    assert '"puppy-tracker-recurring-reminder-card.js"' in frontend
    assert 'scope: "litter"' in source
    assert 'scope: "mother"' in source
    assert 'scope: "puppy"' in source
    assert '"interval", "fixed_times", "once"' in api
    assert 'async_reconcile_recurring_reminders' in api
