"""Structured test and vet follow-ups reuse the existing dossier due-date engine."""

from __future__ import annotations

from datetime import date

import pytest

from custom_components.puppy_tracker.pdf_export import _record_data_text
from custom_components.puppy_tracker.records import create_record
from custom_components.puppy_tracker.upcoming import upcoming_actions


@pytest.mark.parametrize("record_type,source_data,completion_data", [
    ("test", {"test_name": "Giardia", "test_status": "pending", "reference_number": "A-01"},
     {"test_name": "Giardia", "test_status": "completed", "result": "Negative", "reference_number": "B-02"}),
    ("vet_visit", {"reason": "Check", "findings": "Needs review"},
     {"reason": "Recheck", "findings": "Normal", "diagnosis": "Recovered"}),
])
async def test_clinical_followup_creates_new_fact_and_can_chain(
    storage, install_litter, record_type, source_data, completion_data,
) -> None:
    litter_id, puppy_id = install_litter()
    source_data = {**source_data, "next_due_date": "2026-11-05"}
    source_id = await storage.async_add_record(litter_id, puppy_id=puppy_id, record_type=record_type, data=source_data)
    before = storage.get_record(litter_id, source_id, puppy_id)
    actions = upcoming_actions(storage.get_records(litter_id, puppy_id), today=date(2026, 11, 4))
    assert [(action["type"], action["source_record_id"]) for action in actions] == [(record_type, source_id)]
    assert ("Giardia" if record_type == "test" else "Check") in actions[0]["description"]

    completion_id = await storage.async_add_record(
        litter_id, puppy_id=puppy_id, record_type=record_type,
        followup_record_id=source_id, followup_due_date="2026-11-05",
        data={**completion_data, "next_due_date": "2026-11-12"},
    )
    assert storage.get_record(litter_id, source_id, puppy_id) == before
    completed = storage.get_record(litter_id, completion_id, puppy_id)
    assert completed["data"]["followup_record_id"] == source_id
    assert completed["data"]["next_due_date"] == "2026-11-12"
    assert [action["source_record_id"] for action in upcoming_actions(
        storage.get_records(litter_id, puppy_id), today=date(2026, 11, 5),
    )] == [completion_id]
    with pytest.raises(ValueError, match="already been completed"):
        await storage.async_add_record(
            litter_id, puppy_id=puppy_id, record_type=record_type,
            followup_record_id=source_id, followup_due_date="2026-11-05", data=completion_data,
        )


@pytest.mark.parametrize("record_type,data,error", [
    ("test", {"test_status": "unknown"}, "Invalid test status"),
    ("test", {"test_status": "completed"}, "test result"),
    ("test", {"reference_number": "x" * 121}, "reference number"),
    ("test", {"next_due_date": "2026-02-30"}, "follow-up date"),
    ("test", {"next_due_date": "2026-11-05"}, "test name"),
    ("vet_visit", {"next_due_date": "invalid"}, "follow-up date"),
    ("vet_visit", {"next_due_date": "2026-11-05"}, "visit reason or finding"),
])
def test_clinical_values_are_validated(record_type, data, error) -> None:
    with pytest.raises(ValueError, match=error):
        create_record(litter_id="l1", record_type=record_type, data=data)


async def test_invalid_clinical_edit_keeps_existing_record(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter()
    record_id = await storage.async_add_record(litter_id, puppy_id=puppy_id, record_type="test", data={"test_name": "Giardia"})
    before = storage.get_record(litter_id, record_id, puppy_id)
    with pytest.raises(ValueError, match="test result"):
        await storage.async_update_record(litter_id, record_id, puppy_id=puppy_id,
                                          record_type="test", data={"test_name": "Giardia", "test_status": "completed"})
    assert storage.get_record(litter_id, record_id, puppy_id) == before


async def test_empty_vet_followup_cannot_resolve_source(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter()
    source_id = await storage.async_add_record(
        litter_id, puppy_id=puppy_id, record_type="vet_visit",
        data={"reason": "Initial check", "next_due_date": "2026-11-05"},
    )
    with pytest.raises(ValueError, match="visit reason or finding"):
        await storage.async_add_record(
            litter_id, puppy_id=puppy_id, record_type="vet_visit",
            followup_record_id=source_id, followup_due_date="2026-11-05", data={},
        )
    assert [item["source_record_id"] for item in upcoming_actions(
        storage.get_records(litter_id, puppy_id), today=date(2026, 11, 5),
    )] == [source_id]


def test_pdf_uses_readable_status_and_followup_label() -> None:
    record = {"type": "test", "data": {"test_status": "pending", "reference_number": "A-01", "next_due_date": "2026-11-05"}}
    assert "Teststatus: Uitslag afwachten" in _record_data_text(record, "nl")
    assert "Vervolgdatum: 2026-11-05" in _record_data_text(record, "nl")
    assert "Test status: Awaiting result" in _record_data_text(record, "en")
