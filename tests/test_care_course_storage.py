"""Treatment result corrections keep actual data and plan links consistent."""

from copy import deepcopy

import pytest


async def test_course_record_edit_syncs_pdf_data_and_preserves_identity(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter()
    identity = {
        "care_program_id": "course-1", "care_program_revision": 1,
        "care_occurrence_id": f"course-1:course:r1:{puppy_id}:2026-10-28:08:00",
        "care_schedule_type": "course", "care_scheduled_at": "2026-10-28T08:00:00+01:00",
    }
    record_id = await storage.async_add_record(
        litter_id, puppy_id=puppy_id, record_type="medication", title="Medicatiekuur",
        data={**identity, "care_status": "completed", "medication": "Product A", "dose": "1 ml",
              "care_data": {"medication": "Product A", "dose": "1 ml"}},
    )
    await storage.async_update_record(
        litter_id, record_id, puppy_id=puppy_id, record_type="medication",
        data={**identity, "care_status": "completed", "medication": "Product B", "dose": "0.5 ml",
              "care_data": {"medication": "Product A", "dose": "1 ml"}},
    )
    updated = next(item for item in storage.get_records(litter_id, puppy_id) if item["id"] == record_id)
    assert updated["data"]["care_data"] == {"medication": "Product B", "dose": "0.5 ml"}

    with pytest.raises(ValueError, match="category cannot be changed"):
        await storage.async_update_record(litter_id, record_id, puppy_id=puppy_id, record_type="deworming", data=updated["data"])
    with pytest.raises(ValueError, match="identity cannot be changed"):
        await storage.async_update_record(
            litter_id, record_id, puppy_id=puppy_id, record_type="medication",
            data={**updated["data"], "care_occurrence_id": "other"},
        )
    with pytest.raises(ValueError, match="cannot be moved"):
        await storage.async_change_record_owner(
            litter_id, record_id, source_puppy_id=puppy_id, target_puppy_id=None,
        )

    missed = deepcopy(updated["data"])
    missed.update({"care_status": "missed", "care_data": {}})
    missed.pop("medication")
    missed.pop("dose")
    await storage.async_update_record(
        litter_id, record_id, puppy_id=puppy_id, record_type="medication", data=missed,
    )
    after_missed = next(item for item in storage.get_records(litter_id, puppy_id) if item["id"] == record_id)
    assert after_missed["data"]["care_data"] == {}
    assert "medication" not in after_missed["data"]
    with pytest.raises(ValueError, match="actually administered"):
        await storage.async_update_record(
            litter_id, record_id, puppy_id=puppy_id, record_type="medication",
            data={**identity, "care_status": "completed", "care_data": {}},
        )
