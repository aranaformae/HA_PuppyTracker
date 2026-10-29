from __future__ import annotations

import base64
from datetime import timedelta

from homeassistant.util import dt as dt_util

from custom_components.puppy_tracker.pdf_export import (
    _active_care_records,
    _care_result_text,
    build_pdf_export,
)


def test_course_pdf_uses_readable_actual_administration_labels() -> None:
    data = {
        "care_schedule_type": "course", "care_status": "completed",
        "care_data": {"medication": "Product B", "dose": "0.5", "unit": "ml"},
    }
    assert _care_result_text(data, "nl") == "Middel: Product B · Hoeveelheid: 0.5 · Eenheid: ml"
    assert _care_result_text(data, "en") == "Product: Product B · Amount: 0.5 · Unit: ml"
    assert _care_result_text({"care_schedule_type": "course", "care_status": "missed", "care_data": {}}, "nl") == "—"


async def test_pdf_includes_structured_care_result(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter()
    now = dt_util.now().isoformat()
    await storage.async_add_record(
        litter_id,
        record_type="note",
        puppy_id=puppy_id,
        occurred_at=now,
        title="ENS",
        note="Goed opgepakt",
        data={
            "care_program_id": "ens",
            "care_occurrence_id": "ens:puppy-1:7",
            "care_age_days": 7,
            "care_scheduled_at": now,
            "care_status": "completed",
            "care_result": "Rustig",
            "care_score": 4,
            "care_instruction": "Geur 7 · duidelijker natuurlijk: droge aarde.",
            "care_data": {"stimulus": "tactiel"},
        },
    )

    _filename, mime, encoded = build_pdf_export(storage, litter_id, puppy_id=puppy_id)
    pdf = base64.b64decode(encoded)

    assert mime == "application/pdf"
    assert b"Zorgprogrammaresultaten" in pdf
    assert b"ENS" in pdf
    assert b"Uitgevoerd" in pdf
    assert b"Rustig" in pdf
    assert b"Geur 7" in pdf
    assert b"droge aarde" in pdf
    # PDF table cells may wrap one logical value over multiple text operators.
    assert b"stimulus:" in pdf
    assert b"tactiel" in pdf
    assert b"Goed opgepakt" in pdf


async def test_pdf_course_reports_actual_administration_and_missed_status(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter()
    now = dt_util.now().isoformat()
    for suffix, status, care_data in (
        ("08:00", "completed", {"medication": "Product B", "dose": "0.5 ml"}),
        ("18:00", "missed", {}),
    ):
        await storage.async_add_record(
            litter_id, record_type="medication", puppy_id=puppy_id,
            occurred_at=now, title="Medicatiekuur",
            data={
                "care_program_id": "course-1",
                "care_occurrence_id": f"course-1:course:r1:{puppy_id}:2026-10-28:{suffix}",
                "care_schedule_type": "course", "care_scheduled_at": now,
                "care_status": status, "care_data": care_data,
                **care_data,
            },
        )
    _name, _mime, encoded = build_pdf_export(storage, litter_id, puppy_id=puppy_id)
    pdf = base64.b64decode(encoded)
    assert b"Medicatiekuur" in pdf
    assert b"Product B" in pdf
    assert b"Gemist" in pdf
    assert b"0.5" in pdf
    assert b"ml" in pdf


async def test_pdf_care_results_follow_report_period(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter()
    now = dt_util.now()
    for occurrence_id, occurred_at in (
        ("ens:puppy-1:7", now - timedelta(hours=2)),
        ("ens:puppy-1:3", now - timedelta(days=10)),
    ):
        await storage.async_add_record(
            litter_id,
            record_type="note",
            puppy_id=puppy_id,
            occurred_at=occurred_at.isoformat(),
            title="ENS",
            data={
                "care_program_id": "ens",
                "care_occurrence_id": occurrence_id,
                "care_age_days": int(occurrence_id.rsplit(":", 1)[-1]),
                "care_scheduled_at": occurred_at.isoformat(),
                "care_status": "completed",
                "care_result": None,
                "care_score": None,
                "care_data": {},
            },
        )

    records = _active_care_records(storage, litter_id, puppy_id, range_hours=24)

    assert [record["data"]["care_occurrence_id"] for record in records] == ["ens:puppy-1:7"]


async def test_pdf_owner_section_respects_contact_privacy(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter()
    await storage.async_set_puppy_owner_ids(litter_id, puppy_id, ["owner-1"])
    owner = {
        "id": "owner-1",
        "name": "Alex",
        "email": "alex@example.com",
        "phone": "0612345678",
        "street": "Voorbeeldstraat 1",
        "role": "owner",
        "placements": {litter_id: {
        "placement_status": "reserved",
        "placement_date": "2026-09-01",
        "expected_pickup_date": "2026-10-01",
        "payment_status": "deposit",
        "payment_amount": "2500",
        "registration_fee_amount": "250",
        "deposit_amount": "500",
        "deposit_date": "2026-09-02",
        "payment_method": "bank_transfer",
        "payment_balance": "1400",
        "payment_date": "2026-09-20",
        }},
    }

    _filename, _mime, encoded = build_pdf_export(
        storage, litter_id, puppy_id=puppy_id, owner_records=[owner]
    )
    private_pdf = base64.b64decode(encoded)
    assert b"Alex" in private_pdf
    assert b"alex@example.com" not in private_pdf
    assert b"2500" in private_pdf
    assert b"1750" in private_pdf
    assert b"1400" in private_pdf
    assert b"2026-10-01" in private_pdf

    _filename, _mime, encoded = build_pdf_export(
        storage,
        litter_id,
        puppy_id=puppy_id,
        owner_records=[owner],
        sections={"owner_contact": True},
    )
    contact_pdf = base64.b64decode(encoded)
    assert b"alex@example.com" in contact_pdf
