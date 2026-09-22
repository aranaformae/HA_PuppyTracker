"""Behavioral coverage for selectable PDF report content."""

from __future__ import annotations

import base64
from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest

from custom_components.puppy_tracker import pdf_export


NOW = datetime(2026, 9, 22, 12, 0, tzinfo=UTC)
SECTION_KEYS = (
    "summary",
    "chart",
    "measurements",
    "care",
    "attention",
    "owners",
    "owner_contact",
)


def _freeze_time(monkeypatch) -> None:
    monkeypatch.setattr(pdf_export.dt_util, "now", lambda: NOW)
    monkeypatch.setattr(pdf_export.dt_util, "as_local", lambda value: value)


def _sections(*enabled: str) -> dict[str, bool]:
    return {key: key in enabled for key in SECTION_KEYS}


def _pdf_bytes(storage, litter_id: str, **options) -> bytes:
    _filename, mime_type, encoded = pdf_export.build_pdf_export(
        storage,
        litter_id,
        **options,
    )
    assert mime_type == "application/pdf"
    return base64.b64decode(encoded)


async def test_every_pdf_section_can_be_enabled_and_disabled_independently(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _freeze_time(monkeypatch)
    recent = NOW - timedelta(hours=2)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("first", 400, (recent - timedelta(hours=2)).isoformat()),
            make_measurement("latest", 430, recent.isoformat()),
        ],
        puppy_overrides={"owner_ids": ["owner-1"]},
    )
    await storage.async_add_record(
        litter_id,
        record_type="note",
        puppy_id=puppy_id,
        occurred_at=recent.isoformat(),
        title="ENS section marker",
        data={
            "care_occurrence_id": "ens:puppy-1:3",
            "care_status": "completed",
        },
    )
    owners = [{"id": "owner-1", "name": "Owner section marker", "email": "contact-marker@example.com"}]

    empty = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        sections=_sections(),
        owner_records=owners,
    )
    for marker in (
        b"Samenvatting",
        b"Gewichtsontwikkeling",
        b"Verschil",
        b"Zorgprogrammaresultaten",
        b"Actuele status",
        b"Baasjegegevens",
        b"contact-marker@example.com",
    ):
        assert marker not in empty

    cases = {
        "summary": b"Samenvatting",
        "chart": b"Gewichtsontwikkeling",
        "measurements": b"Verschil",
        "care": b"Zorgprogrammaresultaten",
        "attention": b"Actuele status",
        "owners": b"Baasjegegevens",
    }
    for section, marker in cases.items():
        document = _pdf_bytes(
            storage,
            litter_id,
            puppy_id=puppy_id,
            sections=_sections(section),
            owner_records=owners,
        )
        assert marker in document

    contact_document = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        sections=_sections("owners", "owner_contact"),
        owner_records=owners,
    )
    assert b"contact-marker@example.com" in contact_document


async def test_pdf_period_filters_measurements_and_care_results(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _freeze_time(monkeypatch)
    recent = NOW - timedelta(hours=2)
    old = NOW - timedelta(days=10)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("old", 400, old.isoformat(), note="old-weight-marker"),
            make_measurement("recent", 430, recent.isoformat(), note="recent-weight-marker"),
        ]
    )
    for occurred_at, marker in ((old, "old-care-marker"), (recent, "recent-care-marker")):
        await storage.async_add_record(
            litter_id,
            record_type="note",
            puppy_id=puppy_id,
            occurred_at=occurred_at.isoformat(),
            title=marker,
            data={
                "care_occurrence_id": f"care:{marker}",
                "care_status": "completed",
            },
        )

    document = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        range_hours=24,
        sections=_sections("measurements", "care"),
    )

    assert b"recent-weight-marker" in document
    assert b"old-weight-marker" not in document
    assert b"recent-care-marker" in document
    assert b"old-care-marker" not in document


def test_pdf_keeps_inactive_puppies_available_for_historical_reports(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[make_measurement("active", 430, NOW.isoformat())]
    )
    inactive = deepcopy(storage._data["litters"][litter_id]["puppies"][puppy_id])
    inactive.update(
        {
            "id": "inactive-puppy",
            "name": "Archived puppy marker",
            "active": False,
            "measurements": [make_measurement("archived", 520, NOW.isoformat())],
        }
    )
    storage._data["litters"][litter_id]["puppies"][inactive["id"]] = inactive

    litter_document = _pdf_bytes(storage, litter_id, sections=_sections("summary"))
    puppy_document = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=inactive["id"],
        sections=_sections("summary"),
    )

    assert b"Archived puppy marker" in litter_document
    assert b"Archived puppy marker" in puppy_document


def test_owner_contact_requires_owner_section_and_codes_are_localized(
    monkeypatch,
    storage,
    install_litter,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter(puppy_overrides={"owner_ids": ["owner-1"]})
    owner = {
        "id": "owner-1",
        "name": "Alex",
        "email": "alex@example.com",
        "role": "co_owner",
        "placement_status": "reserved",
        "payment_status": "registration_fee",
        "payment_method": "bank_transfer",
    }

    contact_without_owners = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        sections=_sections("owner_contact"),
        owner_records=[owner],
    )
    assert b"Baasjegegevens" not in contact_without_owners
    assert b"alex@example.com" not in contact_without_owners

    owner_document = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        sections=_sections("owners"),
        owner_records=[owner],
    )
    assert b"Mede-eigenaar" in owner_document
    assert b"Gereserveerd" in owner_document
    assert b"Inschrijfgeld" in owner_document
    assert b"Bankoverschrijving" in owner_document
    assert b"alex@example.com" not in owner_document
    for internal_value in (b"co_owner", b"reserved", b"registration_fee", b"bank_transfer"):
        assert internal_value not in owner_document


def test_selected_empty_sections_explain_why_no_rows_are_visible(
    monkeypatch,
    storage,
    install_litter,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter()

    document = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        sections=_sections("chart", "care", "owners"),
    )

    assert b"Minimaal twee geldige metingen" in document
    assert b"Geen zorgprogrammaresultaten" in document
    assert b"Geen gekoppelde baasjes" in document


def test_pdf_wrap_preserves_long_unbroken_contact_values() -> None:
    value = "familie.vandenberg.met.een.lang.adres@example.com"

    lines = pdf_export._wrap(value, 6.6, 136)

    assert "".join(lines) == value
    assert len(lines) > 1
    assert all(pdf_export._estimate_width(line, 6.6) <= 136 for line in lines)


@pytest.mark.parametrize(
    ("range_hours", "label"),
    (
        (24, "Laatste 24 uur"),
        (72, "Laatste 3 dagen"),
        (168, "Laatste 7 dagen"),
        (336, "Laatste 14 dagen"),
        (720, "Laatste 30 dagen"),
        (None, "Volledige historie"),
    ),
)
def test_pdf_period_heading_matches_every_card_option(
    monkeypatch,
    storage,
    install_litter,
    range_hours: float | None,
    label: str,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter()

    document = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        range_hours=range_hours,
        sections=_sections(),
    )

    assert label.encode("ascii") in document


@pytest.mark.parametrize(
    ("label", "hex_color"),
    (
        ("turkoois", "#00acc1"),
        ("Bandje donkerblauw", "#1565c0"),
        ("light pink", "#f48fb1"),
        ("#abc", "#aabbcc"),
    ),
)
def test_pdf_collar_colors_match_the_dashboard_palette(label: str, hex_color: str) -> None:
    expected = tuple(int(hex_color[position : position + 2], 16) / 255 for position in (1, 3, 5))
    assert pdf_export._collar_rgb(label, 0) == pytest.approx(expected)
