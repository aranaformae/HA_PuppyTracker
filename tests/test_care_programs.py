from __future__ import annotations

import pytest

from custom_components.puppy_tracker.care_programs import normalize_care_program


def test_once_program_normalizes_single_age() -> None:
    program = normalize_care_program({
        "litter_id": "litter-1",
        "title": "Ontwormen",
        "record_type": "medication",
        "schedule_type": "once",
        "start_age_days": 35,
        "time_of_day": "09:00",
        "result_fields": ["result", "note"],
    })

    assert program["schedule_type"] == "once"
    assert program["start_age_days"] == 35
    assert program["end_age_days"] == 35
    assert program["interval_days"] is None
    assert program["time_of_day"] == "09:00"
    assert program["record_type"] == "medication"


def test_range_program_supports_daily_ens_and_esi_windows() -> None:
    ens = normalize_care_program({
        "litter_id": "litter-1",
        "title": "ENS",
        "description": "Early Neurological Stimulation",
        "schedule_type": "range",
        "start_age_days": 3,
        "end_age_days": 17,
        "interval_days": 1,
        "result_fields": ["result", "score", "note"],
    })
    esi = normalize_care_program({
        "litter_id": "litter-1",
        "title": "ESI",
        "description": "Early Scent Introduction",
        "schedule_type": "range",
        "start_age_days": 5,
        "end_age_days": 17,
    })

    assert (ens["start_age_days"], ens["end_age_days"], ens["interval_days"]) == (3, 17, 1)
    assert ens["result_fields"] == ["result", "score", "note"]
    assert (esi["start_age_days"], esi["end_age_days"], esi["interval_days"]) == (5, 17, 1)
    assert esi["result_fields"] == ["result", "note"]


def test_program_is_litter_specific_and_notifications_are_configurable() -> None:
    program = normalize_care_program({
        "litter_id": "litter-42",
        "title": "Nagels controleren",
        "schedule_type": "range",
        "start_age_days": 7,
        "end_age_days": 49,
        "interval_days": 7,
        "notifications_enabled": False,
    })

    assert program["litter_id"] == "litter-42"
    assert program["notifications_enabled"] is False
    assert program["enabled"] is True


def test_program_rejects_invalid_age_ranges_and_frequency() -> None:
    with pytest.raises(ValueError, match="end_age_days"):
        normalize_care_program({
            "litter_id": "litter-1",
            "title": "Invalid",
            "schedule_type": "range",
            "start_age_days": 17,
            "end_age_days": 3,
            "interval_days": 1,
        })

    with pytest.raises(ValueError, match="interval_days"):
        normalize_care_program({
            "litter_id": "litter-1",
            "title": "Invalid",
            "schedule_type": "range",
            "start_age_days": 3,
            "end_age_days": 17,
            "interval_days": 0,
        })


def test_program_rejects_unknown_result_fields_and_invalid_clock_time() -> None:
    with pytest.raises(ValueError, match="Unsupported result field"):
        normalize_care_program({
            "litter_id": "litter-1",
            "title": "ENS",
            "schedule_type": "range",
            "start_age_days": 3,
            "end_age_days": 17,
            "result_fields": ["result", "made_up_field"],
        })

    with pytest.raises(ValueError, match="time_of_day"):
        normalize_care_program({
            "litter_id": "litter-1",
            "title": "Ontwormen",
            "schedule_type": "once",
            "start_age_days": 35,
            "time_of_day": "25:00",
        })


def test_program_requires_litter_title_and_supported_schedule() -> None:
    with pytest.raises(ValueError, match="litter_id"):
        normalize_care_program({
            "title": "ENS",
            "schedule_type": "range",
            "start_age_days": 3,
            "end_age_days": 17,
        })

    with pytest.raises(ValueError, match="title"):
        normalize_care_program({
            "litter_id": "litter-1",
            "schedule_type": "once",
            "start_age_days": 35,
        })

    with pytest.raises(ValueError, match="schedule_type"):
        normalize_care_program({
            "litter_id": "litter-1",
            "title": "ENS",
            "schedule_type": "interval",
            "start_age_days": 3,
        })
