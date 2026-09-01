from __future__ import annotations

import asyncio

import pytest

from custom_components.puppy_tracker.care_results import (
    async_record_care_result,
    care_result_record_payload,
    normalize_care_result,
)


def _program(**overrides):
    data = {
        "id": "program-ens",
        "revision": 1,
        "litter_id": "litter-1",
        "title": "ENS",
        "record_type": "note",
        "result_fields": ["result", "score", "note"],
    }
    data.update(overrides)
    return data


def _occurrence(**overrides):
    data = {
        "id": "program-ens:pup-1:7",
        "program_id": "program-ens",
        "program_revision": 1,
        "litter_id": "litter-1",
        "puppy_id": "pup-1",
        "title": "ENS",
        "record_type": "note",
        "age_days": 7,
        "scheduled_at": "2026-09-07T09:00:00+02:00",
    }
    data.update(overrides)
    return data


def test_structured_result_becomes_puppy_dossier_payload() -> None:
    payload = care_result_record_payload(
        _program(),
        _occurrence(),
        {
            "status": "completed",
            "result": "Rustig",
            "score": 4,
            "note": "Goed hersteld na stimulatie.",
            "data": {"exercise": "tactile"},
        },
        occurred_at="2026-09-07T09:12:00+02:00",
    )

    assert payload["litter_id"] == "litter-1"
    assert payload["puppy_id"] == "pup-1"
    assert payload["record_type"] == "note"
    assert payload["title"] == "ENS"
    assert payload["note"] == "Goed hersteld na stimulatie."
    assert payload["occurred_at"] == "2026-09-07T09:12:00+02:00"
    assert payload["data"] == {
        "care_program_id": "program-ens",
        "care_program_revision": 1,
        "care_occurrence_id": "program-ens:pup-1:7",
        "care_age_days": 7,
        "care_scheduled_at": "2026-09-07T09:00:00+02:00",
        "care_status": "completed",
        "care_result": "Rustig",
        "care_score": 4.0,
        "care_data": {"exercise": "tactile"},
    }


def test_missed_occurrence_is_a_persistent_result_too() -> None:
    payload = care_result_record_payload(
        _program(result_fields=["note"]),
        _occurrence(),
        {"status": "missed", "note": "Niet uitgevoerd wegens dierenartsbezoek."},
    )
    assert payload["data"]["care_status"] == "missed"
    assert payload["data"]["care_occurrence_id"] == "program-ens:pup-1:7"


def test_result_fields_follow_program_capabilities() -> None:
    program = _program(result_fields=["note"])
    assert normalize_care_result(program, {"note": "Prima"})["note"] == "Prima"
    with pytest.raises(ValueError, match="result is not enabled"):
        normalize_care_result(program, {"result": "Rustig"})
    with pytest.raises(ValueError, match="score is not enabled"):
        normalize_care_result(program, {"score": 3})


def test_score_must_be_numeric_when_enabled() -> None:
    with pytest.raises(ValueError, match="score must be numeric"):
        normalize_care_result(_program(), {"score": "hoog"})


def test_occurrence_must_match_program_litter_and_revision() -> None:
    with pytest.raises(ValueError, match="does not belong"):
        care_result_record_payload(_program(), _occurrence(program_id="other"), {})
    with pytest.raises(ValueError, match="revision does not match"):
        care_result_record_payload(_program(revision=2), _occurrence(program_revision=1), {})
    with pytest.raises(ValueError, match="litter does not match"):
        care_result_record_payload(_program(), _occurrence(litter_id="other"), {})


def test_persistence_uses_existing_async_add_record_contract() -> None:
    class FakeStorage:
        def __init__(self) -> None:
            self.calls = []

        async def async_add_record(self, litter_id, **kwargs):
            self.calls.append((litter_id, kwargs))
            return "record-1"

    storage = FakeStorage()
    record_id = asyncio.run(
        async_record_care_result(
            storage,
            _program(),
            _occurrence(),
            {"status": "completed", "result": "Neutraal", "score": 3, "note": "OK"},
        )
    )

    assert record_id == "record-1"
    assert len(storage.calls) == 1
    litter_id, kwargs = storage.calls[0]
    assert litter_id == "litter-1"
    assert kwargs["puppy_id"] == "pup-1"
    assert kwargs["data"]["care_occurrence_id"] == "program-ens:pup-1:7"
    assert kwargs["data"]["care_program_revision"] == 1
    assert kwargs["data"]["care_status"] == "completed"
