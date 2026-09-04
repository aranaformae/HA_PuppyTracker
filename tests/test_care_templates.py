import pytest

from unittest.mock import AsyncMock

import pytest

from custom_components.puppy_tracker.care_occurrences import derive_puppy_care_occurrences
from custom_components.puppy_tracker.care_programs import normalize_care_program
from custom_components.puppy_tracker.care_templates import (
    BUILT_IN_TEMPLATES,
    CareProgramTemplateStore,
    _normalize_template,
    normalize_care_template_backup_data,
)


def test_builtin_templates_include_ens_esi_and_deworming() -> None:
    names = {item["name"] for item in BUILT_IN_TEMPLATES}

    assert any(name.startswith("ENS") for name in names)
    assert any(name.startswith("ESI") for name in names)
    assert any(name.startswith("Ontworming") for name in names)
    esi = next(item for item in BUILT_IN_TEMPLATES if item["id"] == "builtin_esi_14_days")
    assert (esi["start_age_days"], esi["end_age_days"]) == (3, 16)
    assert set(esi["instructions_by_age"]) == {str(day) for day in range(3, 17)}


def test_template_normalization_keeps_step_instructions() -> None:
    template = _normalize_template({
        "name": "Mijn routine",
        "title": "Routine",
        "schedule_type": "range",
        "start_age_days": 3,
        "end_age_days": 4,
        "interval_days": 1,
        "time_of_day": "09:00",
        "instructions": "Stap 1",
    })

    assert template["name"] == "Mijn routine"
    assert template["instructions"] == "Stap 1"


def test_template_normalization_rejects_an_incomplete_schedule() -> None:
    with pytest.raises(ValueError, match="schedule_type"):
        _normalize_template({"name": "Ongeldig", "title": "Routine"})


def test_template_backup_data_is_validated_and_normalized() -> None:
    template = _normalize_template({
        "name": "Mijn routine",
        "title": "Routine",
        "schedule_type": "once",
        "start_age_days": 3,
        "time_of_day": "09:00",
    })

    assert normalize_care_template_backup_data({"templates": {template["id"]: template}}) == {
        "templates": {template["id"]: template}
    }

    with pytest.raises(ValueError, match="identifier"):
        normalize_care_template_backup_data({"templates": {"wrong": template}})


def test_template_normalization_rejects_invalid_day_instruction_keys() -> None:
    with pytest.raises(ValueError, match="keys must be ages"):
        _normalize_template({
            "name": "Ongeldig",
            "title": "Routine",
            "schedule_type": "once",
            "start_age_days": 3,
            "time_of_day": "09:00",
            "instructions_by_age": {"weekend": "Niet geldig"},
        })


async def test_template_batch_save_rolls_back_in_memory_state_on_storage_failure(hass) -> None:
    store = CareProgramTemplateStore(hass)
    store._data = {"templates": {}}
    store._store.async_save = AsyncMock(side_effect=RuntimeError("disk failure"))

    with pytest.raises(RuntimeError, match="disk failure"):
        await store.async_save_many([{
            "name": "Mijn routine",
            "title": "Routine",
            "schedule_type": "once",
            "start_age_days": 3,
            "time_of_day": "09:00",
        }])

    assert store.get_backup_data() == {"templates": {}}


def test_age_specific_template_instruction_is_added_to_occurrence() -> None:
    program = normalize_care_program({
        "id": "esi", "litter_id": "litter-1", "title": "ESI",
        "schedule_type": "range", "start_age_days": 5, "end_age_days": 6,
        "instructions": "Algemene instructie",
        "instructions_by_age": {"5": "Geur voor dag 5"},
    })
    occurrence = derive_puppy_care_occurrences(program, {
        "id": "pup-1", "name": "Rood", "birth_time": "2026-09-02T06:30:00+02:00",
    })

    assert occurrence[0]["instructions"] == "Geur voor dag 5"
    assert occurrence[1]["instructions"] == "Algemene instructie"
