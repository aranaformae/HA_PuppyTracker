"""Behavioral coverage for selectable PDF report content."""

from __future__ import annotations

import base64
from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest

from custom_components.puppy_tracker import pdf_export


NOW = datetime(2026, 9, 22, 12, 0, tzinfo=UTC)
SECTION_KEYS = (
    "identity",
    "summary",
    "chart",
    "measurements",
    "care",
    "dossier",
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
    await storage.async_add_record(
        litter_id,
        record_type="temperature",
        puppy_id=puppy_id,
        occurred_at=recent.isoformat(),
        title="Temperature section marker",
        data={"temperature_c": 38.5},
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
        b"Moeder",
        b"Gewichtsontwikkeling",
        b"Verschil",
        b"Zorgprogrammaresultaten",
        b"Actuele status",
        b"Baasjegegevens",
        b"Temperature",
        b"contact-marker@example.com",
    ):
        assert marker not in empty

    cases = {
        "identity": b"Moeder",
        "summary": b"Samenvatting",
        "chart": b"Gewichtsontwikkeling",
        "measurements": b"Verschil",
        "care": b"Zorgprogrammaresultaten",
        "dossier": b"Temperature",
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

    assert b"Geen geldige metingen voor een grafiek" in document
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


async def test_dossier_filters_are_independent_of_care_and_scope(
    monkeypatch, storage, install_litter,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter()
    for record_type, owner_id, title, age_days in (
        ("temperature", puppy_id, "puppy-temperature-marker", 0),
        ("feeding", puppy_id, "puppy-feeding-marker", 0),
        ("note", None, "litter-note-marker", 0),
        ("temperature", puppy_id, "old-temperature-marker", 10),
    ):
        await storage.async_add_record(
            litter_id,
            record_type=record_type,
            puppy_id=owner_id,
            occurred_at=(NOW - timedelta(days=age_days)).isoformat(),
            title=title,
            data={"temperature_c": 38.4, "reference_id": "secret-reference-marker"},
        )
    await storage.async_add_record(
        litter_id, record_type="note", puppy_id=puppy_id,
        occurred_at=NOW.isoformat(), title="care-marker",
        data={"care_occurrence_id": "secret-care-marker"},
    )
    document = _pdf_bytes(
        storage, litter_id, puppy_id=puppy_id, range_hours=24,
        sections=_sections("dossier"), dossier_types=["temperature"],
        dossier_scopes=["puppy"],
    )
    assert b"puppy-temperature-marker" in document
    for marker in (b"puppy-feeding-marker", b"litter-note-marker", b"old-temperature-marker", b"care-marker", b"secret-reference-marker"):
        assert marker not in document
    assert b"Temperatuur" in document
    assert b"38.4" in document

    litter_only = _pdf_bytes(
        storage, litter_id, puppy_id=puppy_id,
        sections=_sections("dossier"), dossier_types=["note"],
        dossier_scopes=["litter"],
    )
    assert b"litter-note-marker" in litter_only
    assert b"care-marker" not in litter_only

    none_selected = _pdf_bytes(
        storage, litter_id, puppy_id=puppy_id,
        sections=_sections("dossier"), dossier_types=[], dossier_scopes=[],
    )
    assert b"Geen dossieritems met deze filters" in none_selected
    assert b"puppy-temperature-marker" not in none_selected
    assert b"litter-note-marker" not in none_selected


async def test_individual_puppy_pdf_includes_litter_notes_by_default(
    monkeypatch, storage, install_litter,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter()
    for owner_id, title in ((None, "Nestnotitie"), (puppy_id, "Pupnotitie")):
        await storage.async_add_record(
            litter_id,
            record_type="note",
            puppy_id=owner_id,
            occurred_at=NOW.isoformat(),
            title=title,
            note="Gedeelde context" if owner_id is None else "Eigen context",
        )

    document = _pdf_bytes(
        storage, litter_id, puppy_id=puppy_id,
        sections=_sections("dossier"),
    )

    assert document.count(b"Nestnotitie") == 1
    assert document.count(b"Pupnotitie") == 1
    assert b"Hele nest" in document


def test_attention_off_removes_warning_status_from_summary(
    monkeypatch, storage, install_litter,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter()
    monkeypatch.setattr(pdf_export, "calculate_puppy_metrics", lambda *_args: {
        "status": "Private warning marker", "status_code": "weight_loss",
        "needs_attention": True, "current_weight": 350,
    })
    document = _pdf_bytes(
        storage, litter_id, puppy_id=puppy_id,
        sections=_sections("summary"),
    )
    assert b"Samenvatting" in document
    assert b"Status" not in document
    assert b"Actuele aandachtspunten" not in document
    assert b"Private warning marker" not in document


def test_single_measurement_chart_has_visible_marker(
    monkeypatch, storage, install_litter, make_measurement,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[make_measurement("only", 410, NOW.isoformat())]
    )
    document = _pdf_bytes(storage, litter_id, puppy_id=puppy_id, sections=_sections("chart"))
    assert b"Gewichtsontwikkeling" in document
    assert b"Geen geldige metingen voor een grafiek" not in document
    assert b"4 4 re f" in document


def test_first_measurement_in_period_uses_previous_effective_weight(
    monkeypatch, storage, install_litter, make_measurement,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter(measurements=[
        make_measurement("old", 400, (NOW - timedelta(days=3)).isoformat()),
        make_measurement("recent", 430, (NOW - timedelta(hours=2)).isoformat()),
    ])
    document = _pdf_bytes(
        storage, litter_id, puppy_id=puppy_id,
        range_hours=24, sections=_sections("measurements"),
    )
    assert b"+30 g" in document
    assert b"400 g" not in document


def test_pdf_english_localizes_labels_and_keeps_user_text(
    monkeypatch, storage, install_litter, make_measurement,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[make_measurement("only", 410, NOW.isoformat(), note="eigen notitie")],
    )
    document = _pdf_bytes(
        storage, litter_id, puppy_id=puppy_id, language="en",
        sections=_sections("identity", "measurements", "chart"),
    )
    for marker in (b"Full history", b"Mother", b"Date/time", b"Weight development", b"eigen notitie"):
        assert marker in document
    for marker in (b"Volledige historie", b"Gewichtsontwikkeling", b"Datum/tijd"):
        assert marker not in document


def test_dossier_field_labels_are_readable_without_internal_references() -> None:
    record = {
        "data": {
            "temperature": 38.4,
            "test_name": "DNA",
            "next_due_date": "2026-10-01",
            "reference_id": "private-id",
        },
    }
    dutch = pdf_export._record_data_text(record, "nl")
    english = pdf_export._record_data_text(record, "en")
    assert "Temperatuur: 38.4" in dutch
    assert "Testnaam: DNA" in dutch
    assert "Volgende datum: 2026-10-01" in dutch
    assert "Temperature: 38.4" in english
    assert "Test name: DNA" in english
    assert "Next due date: 2026-10-01" in english
    assert "private-id" not in dutch + english


def test_long_table_row_continues_on_new_pages_without_clipping() -> None:
    report = pdf_export._PdfReport()
    long_note = " ".join(f"fragment{i:04d}" for i in range(1500))
    report.table(["Date", "Note"], [["2026-09-23", long_note]], [90, 391])
    document = report.build()
    assert len(report.pages) > 1
    assert b"fragment0000" in document
    assert b"fragment1499" in document
    assert all(b"(Date)" in bytes(page.operations) for page in report.pages)
    assert report.y <= pdf_export.PAGE_HEIGHT - pdf_export.MARGIN
