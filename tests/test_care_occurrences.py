from __future__ import annotations

from zoneinfo import ZoneInfo

from homeassistant.util import dt as dt_util

from custom_components.puppy_tracker.care_occurrences import (
    care_program_age_days,
    derive_litter_care_occurrences,
    derive_puppy_care_occurrences,
)
from custom_components.puppy_tracker.care_programs import normalize_care_program


def _puppy(puppy_id: str, name: str, birth_time: str = "2026-09-02T06:30:00+02:00") -> dict:
    return {
        "id": puppy_id,
        "name": name,
        "birth_time": birth_time,
        "active": True,
    }


def _use_amsterdam_local_time(monkeypatch) -> None:
    zone = ZoneInfo("Europe/Amsterdam")
    monkeypatch.setattr(dt_util, "as_local", lambda value: value.astimezone(zone))


def test_ens_range_creates_one_fixed_occurrence_per_age_day(monkeypatch) -> None:
    _use_amsterdam_local_time(monkeypatch)
    program = normalize_care_program({
        "id": "ens",
        "litter_id": "litter-1",
        "title": "ENS",
        "schedule_type": "range",
        "start_age_days": 3,
        "end_age_days": 17,
        "interval_days": 1,
        "time_of_day": "09:00",
        "result_fields": ["result", "score", "note"],
    })

    ages = care_program_age_days(program)
    occurrences = derive_puppy_care_occurrences(program, _puppy("pup-1", "Rood"))

    assert ages == list(range(3, 18))
    assert len(occurrences) == 15
    assert occurrences[0]["id"] == "ens:pup-1:3"
    assert occurrences[-1]["id"] == "ens:pup-1:17"
    assert occurrences[0]["program_revision"] == 1
    assert occurrences[0]["scheduled_at"] == "2026-09-05T09:00:00+02:00"
    assert occurrences[-1]["scheduled_at"] == "2026-09-19T09:00:00+02:00"
    assert occurrences[0]["time_of_day"] == "09:00"
    assert occurrences[0]["result_fields"] == ["result", "score", "note"]


def test_revision_one_keeps_v017_occurrence_ids_and_later_revisions_are_isolated() -> None:
    base = normalize_care_program({
        "id": "ens",
        "revision": 1,
        "litter_id": "litter-1",
        "title": "ENS",
        "schedule_type": "once",
        "start_age_days": 7,
    })
    revised = {**base, "revision": 2, "title": "ENS revised"}

    old = derive_puppy_care_occurrences(base, _puppy("pup-1", "Rood"))[0]
    new = derive_puppy_care_occurrences(revised, _puppy("pup-1", "Rood"))[0]

    assert old["id"] == "ens:pup-1:7"
    assert new["id"] == "ens:r2:pup-1:7"
    assert old["id"] != new["id"]


def test_configured_clock_time_uses_ha_local_timezone_and_target_dst(monkeypatch) -> None:
    _use_amsterdam_local_time(monkeypatch)
    program = normalize_care_program({
        "id": "care",
        "litter_id": "litter-1",
        "title": "Care",
        "schedule_type": "once",
        "start_age_days": 3,
        "time_of_day": "09:00",
    })

    # Stored birth timestamps are canonical UTC. The target date crosses the
    # 2026 Europe/Amsterdam DST transition, so 09:00 must become +01:00.
    occurrence = derive_puppy_care_occurrences(
        program,
        _puppy("pup-1", "Rood", "2026-10-23T06:30:00+00:00"),
    )[0]

    assert occurrence["scheduled_at"] == "2026-10-26T09:00:00+01:00"
    assert occurrence["scheduled_date"] == "2026-10-26"


def test_esi_schedule_is_independent_from_completion_timing() -> None:
    program = normalize_care_program({
        "id": "esi",
        "litter_id": "litter-1",
        "title": "ESI",
        "schedule_type": "range",
        "start_age_days": 5,
        "end_age_days": 17,
        "interval_days": 1,
    })

    occurrences = derive_puppy_care_occurrences(program, _puppy("pup-1", "Rood"))
    ids = [item["id"] for item in occurrences]

    assert len(occurrences) == 13
    assert ids[:3] == ["esi:pup-1:5", "esi:pup-1:6", "esi:pup-1:7"]
    assert ids[-1] == "esi:pup-1:17"
    assert "last_completed_at" not in occurrences[0]
    assert "completed" not in occurrences[0]


def test_once_program_creates_single_puppy_occurrence() -> None:
    program = normalize_care_program({
        "id": "deworm-5w",
        "litter_id": "litter-1",
        "title": "Ontwormen",
        "record_type": "medication",
        "schedule_type": "once",
        "start_age_days": 35,
    })

    occurrences = derive_puppy_care_occurrences(program, _puppy("pup-2", "Blauw"))

    assert len(occurrences) == 1
    assert occurrences[0]["id"] == "deworm-5w:pup-2:35"
    assert occurrences[0]["age_days"] == 35
    assert occurrences[0]["record_type"] == "medication"
    assert occurrences[0]["scheduled_at"] == "2026-10-07T06:30:00+02:00"


def test_litter_derivation_keeps_occurrences_separate_per_puppy() -> None:
    program = normalize_care_program({
        "id": "ens",
        "litter_id": "litter-1",
        "title": "ENS",
        "schedule_type": "range",
        "start_age_days": 3,
        "end_age_days": 4,
        "interval_days": 1,
    })
    inactive = _puppy("pup-3", "Groen")
    inactive["active"] = False

    occurrences = derive_litter_care_occurrences(
        program,
        [_puppy("pup-1", "Rood"), _puppy("pup-2", "Blauw"), inactive],
    )

    assert len(occurrences) == 4
    assert {item["puppy_id"] for item in occurrences} == {"pup-1", "pup-2"}
    assert {item["id"] for item in occurrences} == {
        "ens:pup-1:3",
        "ens:pup-2:3",
        "ens:pup-1:4",
        "ens:pup-2:4",
    }


def test_missing_birth_time_is_rejected() -> None:
    program = normalize_care_program({
        "id": "ens",
        "litter_id": "litter-1",
        "title": "ENS",
        "schedule_type": "once",
        "start_age_days": 3,
    })

    puppy = {"id": "pup-1", "name": "Rood", "active": True}
    try:
        derive_puppy_care_occurrences(program, puppy)
    except ValueError as err:
        assert str(err) == "puppy birth_time is required"
    else:
        raise AssertionError("Expected missing birth_time to fail")
