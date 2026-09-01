from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.care_programs import (
    AgeBasedCareProgramStore,
    care_program_identity_changed,
    normalize_care_program,
)


def _program_data(**overrides) -> dict:
    data = {
        "id": "program-1",
        "litter_id": "litter-1",
        "title": "ENS",
        "description": "Daily ENS protocol",
        "record_type": "note",
        "schedule_type": "range",
        "start_age_days": 3,
        "end_age_days": 17,
        "interval_days": 1,
        "time_of_day": "09:00",
        "result_fields": ["result", "note"],
    }
    data.update(overrides)
    return data


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
    assert program["revision"] == 1


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


def test_program_rejects_unknown_result_fields_invalid_clock_and_record_type() -> None:
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

    with pytest.raises(ValueError, match="lowercase snake_case"):
        normalize_care_program({
            "litter_id": "litter-1",
            "title": "Invalid type",
            "record_type": "Not Valid",
            "schedule_type": "once",
            "start_age_days": 3,
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


def test_normalization_preserves_existing_updated_at_on_load() -> None:
    program = normalize_care_program(
        _program_data(
            created_at="2026-08-31T10:00:00+00:00",
            updated_at="2026-08-31T11:00:00+00:00",
        ),
        program_id="program-1",
    )
    assert program["created_at"] == "2026-08-31T10:00:00+00:00"
    assert program["updated_at"] == "2026-08-31T11:00:00+00:00"


def test_occurrence_identity_excludes_operational_and_description_changes() -> None:
    current = normalize_care_program(_program_data(), program_id="program-1")

    assert not care_program_identity_changed(
        current,
        normalize_care_program(
            {**current, "description": "Improved explanation"},
            program_id="program-1",
        ),
    )
    assert not care_program_identity_changed(
        current,
        normalize_care_program(
            {**current, "enabled": False, "notifications_enabled": False},
            program_id="program-1",
        ),
    )


def test_occurrence_identity_changes_for_protocol_fields() -> None:
    current = normalize_care_program(_program_data(), program_id="program-1")
    for field, value in (
        ("title", "ENS revised"),
        ("record_type", "test"),
        ("start_age_days", 4),
        ("end_age_days", 18),
        ("interval_days", 2),
        ("time_of_day", "10:00"),
        ("result_fields", ["score", "note"]),
    ):
        candidate = normalize_care_program(
            {**current, field: value},
            program_id="program-1",
        )
        assert care_program_identity_changed(current, candidate), field


async def test_identity_update_increments_revision_but_operational_changes_do_not(hass) -> None:
    store = AgeBasedCareProgramStore(hass)
    initial = normalize_care_program(_program_data(), program_id="program-1")
    store._data = {"programs": {"program-1": initial}}
    store._store.async_save = AsyncMock()

    await store.async_update(
        "program-1",
        {"notifications_enabled": False, "description": "Updated explanation"},
    )
    assert store.get_program("program-1")["revision"] == 1

    await store.async_update("program-1", {"title": "ENS nieuw protocol"})
    assert store.get_program("program-1")["revision"] == 2


async def test_existing_program_cannot_be_moved_to_another_litter(hass) -> None:
    store = AgeBasedCareProgramStore(hass)
    initial = normalize_care_program(_program_data(), program_id="program-1")
    store._data = {"programs": {"program-1": initial}}
    store._store.async_save = AsyncMock()

    with pytest.raises(ValueError, match="litter_id cannot be changed"):
        await store.async_update("program-1", {"litter_id": "litter-2"})


def test_revision_must_be_positive() -> None:
    with pytest.raises(ValueError, match="revision"):
        normalize_care_program(_program_data(revision=0))


async def test_invalid_loaded_program_is_quarantined_not_deleted(hass) -> None:
    store = AgeBasedCareProgramStore(hass)
    raw = {"id": "broken", "litter_id": "litter-1", "title": "Broken"}
    store._store.async_load = AsyncMock(return_value={"programs": {"broken": raw}})
    store._store.async_save = AsyncMock()

    await store.async_load()

    assert store.get_program("broken") is None
    assert store.get_quarantined_program_count() == 1
    saved = store._store.async_save.await_args.args[0]
    assert saved["quarantined_programs"]["broken"] == raw


async def test_valid_loaded_program_does_not_rewrite_unchanged_timestamps(hass) -> None:
    store = AgeBasedCareProgramStore(hass)
    program = normalize_care_program(
        _program_data(
            revision=1,
            created_at="2026-08-31T10:00:00+00:00",
            updated_at="2026-08-31T11:00:00+00:00",
        ),
        program_id="program-1",
    )
    store._store.async_load = AsyncMock(return_value={"programs": {"program-1": program}})
    store._store.async_save = AsyncMock()

    await store.async_load()

    store._store.async_save.assert_not_awaited()
    assert store.get_program("program-1")["updated_at"] == "2026-08-31T11:00:00+00:00"


async def test_failed_program_save_rolls_back_runtime_state(hass) -> None:
    store = AgeBasedCareProgramStore(hass)
    initial = normalize_care_program(_program_data(), program_id="program-1")
    store._data = {"programs": {"program-1": initial}}
    before = store.get_program("program-1")
    store._store.async_save = AsyncMock(side_effect=RuntimeError("disk failure"))

    with pytest.raises(RuntimeError, match="disk failure"):
        await store.async_update("program-1", {"title": "Should roll back"})

    assert store.get_program("program-1") == before
