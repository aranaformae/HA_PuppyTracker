"""Regression tests for derived Puppy Tracker upcoming dossier actions."""

from __future__ import annotations

from datetime import date, datetime, timezone

from custom_components.puppy_tracker import api
from custom_components.puppy_tracker.records import (
    RECORD_SCOPE_LITTER,
    RECORD_SCOPE_PUPPY,
)
from custom_components.puppy_tracker.upcoming import (
    STATUS_DUE_TODAY,
    STATUS_OVERDUE,
    STATUS_UPCOMING,
    upcoming_actions,
    upcoming_summary,
)


def _record(
    record_id: str,
    record_type: str,
    *,
    due_date: str | None,
    occurred_at: str = "2026-09-01T10:00:00+00:00",
    created_at: str | None = None,
    deleted: bool = False,
    litter_id: str = "litter-1",
    puppy_id: str | None = "puppy-1",
    data: dict | None = None,
) -> dict:
    payload = {} if data is None else dict(data)
    if due_date is not None:
        payload["next_due_date"] = due_date
    return {
        "id": record_id,
        "type": record_type,
        "scope": RECORD_SCOPE_PUPPY if puppy_id else RECORD_SCOPE_LITTER,
        "litter_id": litter_id,
        "puppy_id": puppy_id,
        "puppy_name": "Groen" if puppy_id == "puppy-1" else "Geel",
        "occurred_at": occurred_at,
        "created_at": created_at or occurred_at,
        "updated_at": created_at or occurred_at,
        "deleted": deleted,
        "deleted_at": created_at or occurred_at if deleted else None,
        "title": None,
        "note": None,
        "data": payload,
    }


def test_vaccination_and_deworming_next_due_dates_create_actions() -> None:
    actions = upcoming_actions(
        [
            _record("vaccination", "vaccination", due_date="2026-09-11"),
            _record("deworming", "deworming", due_date="2026-09-12"),
        ],
        today=date(2026, 9, 10),
    )

    assert [item["type"] for item in actions] == ["vaccination", "deworming"]
    assert actions[0]["source_record_id"] == "vaccination"
    assert actions[0]["due_at"] == "2026-09-11"
    assert actions[0]["days_until_due"] == 1


def test_deleted_invalid_unknown_and_missing_due_records_are_ignored() -> None:
    records = [
        _record("deleted", "vaccination", due_date="2026-09-11", deleted=True),
        _record("invalid", "deworming", due_date="11-09-2026"),
        _record("unknown", "microchip_registration", due_date="2026-09-11"),
        _record("missing", "vaccination", due_date=None),
        {"id": "not-dict-data", "type": "vaccination", "data": []},
    ]

    assert upcoming_actions(records, today=date(2026, 9, 10)) == []


def test_due_statuses_are_derived_from_local_calendar_days() -> None:
    records = [
        _record("overdue", "vaccination", due_date="2026-09-09"),
        _record("today", "deworming", due_date="2026-09-10"),
        _record("upcoming", "vaccination", due_date="2026-09-13"),
    ]

    actions = upcoming_actions(records, today=date(2026, 9, 10))
    by_id = {item["source_record_id"]: item for item in actions}

    assert by_id["overdue"]["status"] == STATUS_OVERDUE
    assert by_id["overdue"]["days_until_due"] == -1
    assert by_id["today"]["status"] == STATUS_DUE_TODAY
    assert by_id["today"]["days_until_due"] == 0
    assert by_id["upcoming"]["status"] == STATUS_UPCOMING
    assert by_id["upcoming"]["days_until_due"] == 3


def test_date_only_values_do_not_shift_through_utc_conversion() -> None:
    action = upcoming_actions(
        [_record("today", "vaccination", due_date="2026-03-29")],
        today=date(2026, 3, 29),
    )[0]

    assert action["due_date"] == "2026-03-29"
    assert action["status"] == STATUS_DUE_TODAY


def test_days_ahead_and_include_overdue_filters_are_applied() -> None:
    records = [
        _record("overdue", "vaccination", due_date="2026-09-09"),
        _record("inside", "deworming", due_date="2026-09-15"),
        _record("outside", "vaccination", due_date="2026-09-20"),
    ]

    actions = upcoming_actions(
        records,
        today=date(2026, 9, 10),
        days_ahead=5,
        include_overdue=False,
    )

    assert [item["source_record_id"] for item in actions] == ["inside"]


def test_litter_and_puppy_filters_are_applied() -> None:
    records = [
        _record("litter", "vaccination", due_date="2026-09-11", puppy_id=None),
        _record("puppy-1", "vaccination", due_date="2026-09-12", puppy_id="puppy-1"),
        _record("puppy-2", "deworming", due_date="2026-09-13", puppy_id="puppy-2"),
        _record("other-litter", "vaccination", due_date="2026-09-14", litter_id="other"),
    ]

    actions = upcoming_actions(
        records,
        today=date(2026, 9, 10),
        litter_id="litter-1",
        puppy_id="puppy-1",
    )

    assert [item["source_record_id"] for item in actions] == ["puppy-1"]


def test_sorting_is_status_first_then_chronological_and_deterministic() -> None:
    records = [
        _record("upcoming-a", "vaccination", due_date="2026-09-11"),
        _record("today", "deworming", due_date="2026-09-10"),
        _record("overdue-new", "vaccination", due_date="2026-09-09", occurred_at="2026-09-02T10:00:00+00:00"),
        _record("overdue-old", "deworming", due_date="2026-09-08", occurred_at="2026-09-01T10:00:00+00:00"),
        _record("upcoming-b", "deworming", due_date="2026-09-11"),
    ]

    actions = upcoming_actions(records, today=date(2026, 9, 10))

    assert [item["source_record_id"] for item in actions] == [
        "overdue-old",
        "overdue-new",
        "today",
        "upcoming-a",
        "upcoming-b",
    ]


def test_multiple_records_of_same_type_create_multiple_actions() -> None:
    actions = upcoming_actions(
        [
            _record("first", "vaccination", due_date="2026-09-11"),
            _record("second", "vaccination", due_date="2026-09-12"),
        ],
        today=date(2026, 9, 10),
    )

    assert [item["source_record_id"] for item in actions] == ["first", "second"]


def test_summary_counts_match_derived_actions() -> None:
    actions = upcoming_actions(
        [
            _record("overdue", "vaccination", due_date="2026-09-09"),
            _record("today", "deworming", due_date="2026-09-10"),
            _record("upcoming", "vaccination", due_date="2026-09-11"),
        ],
        today=date(2026, 9, 10),
    )

    summary = upcoming_summary(actions)

    assert summary["overdue_count"] == 1
    assert summary["due_today_count"] == 1
    assert summary["upcoming_count"] == 1
    assert summary["total_count"] == 3


def test_record_changes_are_reflected_without_persistent_action_state() -> None:
    record = _record("source", "vaccination", due_date="2026-09-20")

    first = upcoming_actions([record], today=date(2026, 9, 10))[0]
    record["data"]["next_due_date"] = "2026-09-12"
    second = upcoming_actions([record], today=date(2026, 9, 10))[0]

    assert first["due_date"] == "2026-09-20"
    assert second["due_date"] == "2026-09-12"
    assert second["days_until_due"] == 2


async def test_upcoming_payload_uses_storage_records_and_puppy_filter(
    storage,
    install_litter,
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        api.dt_util,
        "now",
        lambda: datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc),
    )
    litter_id, puppy_id = install_litter()
    await storage.async_add_record(
        litter_id,
        puppy_id=puppy_id,
        record_type="vaccination",
        occurred_at="2026-09-01T10:00:00+00:00",
        data={"next_due_date": "2026-09-10"},
    )
    await storage.async_add_record(
        litter_id,
        puppy_id=puppy_id,
        record_type="deworming",
        occurred_at="2026-09-02T10:00:00+00:00",
        data={"next_due_date": "2099-09-10"},
    )

    payload = api._upcoming_payload(
        storage,
        litter_id,
        puppy_id,
        include_overdue=True,
        days_ahead=30,
    )

    assert payload["litter"]["id"] == litter_id
    assert payload["puppy_id"] == puppy_id
    assert [item["type"] for item in payload["actions"]] == ["vaccination"]
    assert payload["summary"]["due_today_count"] == 1
