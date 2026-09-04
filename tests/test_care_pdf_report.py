from __future__ import annotations

import base64
from datetime import timedelta

from homeassistant.util import dt as dt_util

from custom_components.puppy_tracker.pdf_export import (
    _active_care_records,
    build_pdf_export,
)


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
    # PDF table cells may wrap one logical value over multiple text operators.
    assert b"stimulus:" in pdf
    assert b"tactiel" in pdf
    assert b"Goed opgepakt" in pdf


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
        "address": "Voorbeeldstraat 1",
        "role": "owner",
        "placement_status": "reserved",
        "placement_date": "2026-09-01",
        "payment_status": "deposit",
        "payment_amount": "1250",
        "payment_method": "bank_transfer",
        "payment_balance": "250",
        "payment_date": "2026-09-02",
    }

    _filename, _mime, encoded = build_pdf_export(
        storage, litter_id, puppy_id=puppy_id, owner_records=[owner]
    )
    private_pdf = base64.b64decode(encoded)
    assert b"Alex" in private_pdf
    assert b"alex@example.com" not in private_pdf
    assert b"1250" in private_pdf

    _filename, _mime, encoded = build_pdf_export(
        storage,
        litter_id,
        puppy_id=puppy_id,
        owner_records=[owner],
        sections={"owner_contact": True},
    )
    contact_pdf = base64.b64decode(encoded)
    assert b"alex@example.com" in contact_pdf
