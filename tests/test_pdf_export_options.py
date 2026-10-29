"""Behavioral coverage for selectable PDF report content."""

from __future__ import annotations

import base64
from copy import deepcopy
from datetime import UTC, datetime, timedelta

import pytest

from custom_components.puppy_tracker import pdf_export
from custom_components.puppy_tracker.behavior import BEHAVIOR_CRITERIA


NOW = datetime(2026, 9, 22, 12, 0, tzinfo=UTC)
SECTION_KEYS = (
    "identity",
    "summary",
    "chart",
    "measurements",
    "care",
    "behavior",
    "dossier",
    "attention",
    "owners",
    "owner_contact",
    "brand_logo",
    "breeder_name",
    "breeder_contact",
    "profile_note",
)


def test_pdf_behavior_labels_cover_every_criterion() -> None:
    assert set(pdf_export._BEHAVIOR_LABELS["nl"]) == BEHAVIOR_CRITERIA
    assert set(pdf_export._BEHAVIOR_LABELS["en"]) == BEHAVIOR_CRITERIA


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


async def test_branding_and_profile_note_visibility(storage, install_litter):
    litter_id, puppy_id = install_litter(puppy_overrides={"profile_note": "Private profile marker"})
    branding = {"name": "Kennel marker", "contact": "breeder-marker@example.com"}
    markers = {"breeder_name": b"Kennel marker", "breeder_contact": b"breeder-marker@example.com", "profile_note": b"Private profile marker", "brand_logo": b"/Subtype /Image"}
    for section, marker in markers.items():
        enabled = ("identity", section) if section == "profile_note" else (section,)
        document = _pdf_bytes(storage, litter_id, puppy_id=puppy_id, sections=_sections(*enabled), branding=branding)
        assert marker in document
        for other, other_marker in markers.items():
            if other != section:
                assert other_marker not in document
    assert b"Private profile marker" not in _pdf_bytes(storage, litter_id, sections=_sections("profile_note"))
    assert b"Private profile marker" not in _pdf_bytes(storage, litter_id, sections=_sections("identity"))
    # A selected puppy must never include another puppy's profile note.
    storage.get_litter(litter_id)["puppies"]["other"] = {"name": "Other", "profile_note": "Other private marker"}
    assert b"Other private marker" not in _pdf_bytes(storage, litter_id, puppy_id=puppy_id, sections=_sections("identity", "profile_note"))


@pytest.mark.parametrize("encoded", ["not base64", "", "A" * 700_001, base64.b64encode(b"not a jpeg").decode(), base64.b64encode(b"\xff\xd8\xff\xe0\x00\x00\xff\xd9").decode()], ids=["invalid-base64", "empty", "oversized", "not-jpeg", "invalid-segment"])
def test_invalid_custom_logo_uses_bundled_fallback(encoded):
    assert pdf_export._report_logo(encoded) == pdf_export.normalize_logo(pdf_export.LOGO_PATH.read_bytes())


def test_logo_preserves_aspect_ratio_and_accepts_valid_inline_jpeg():
    assert pdf_export.LOGO_PATH.name == "icon@2x.png"
    assert not (pdf_export.LOGO_PATH.parent / "logo.jpg").exists()
    logo = pdf_export._report_logo(None)
    assert pdf_export._report_logo(base64.b64encode(logo).decode()) == logo
    report = pdf_export._PdfReport(logo)
    report.brand_logo()
    width, height = pdf_export._jpeg_dimensions(logo)
    scale = min(96 / width, 64 / height)
    assert f"q {width * scale:.2f} 0 0 {height * scale:.2f}" in report.build().decode("latin1")


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
    await storage.async_add_record(
        litter_id,
        puppy_id=puppy_id,
        record_type="behavior_observation",
        occurred_at=recent.isoformat(),
        title="Behavior section marker",
        data={"scores": {"curiosity": 4}, "observer": "Behavior observer marker"},
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
        b"Gedragsprofiel",
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
        "behavior": b"Gedragsprofiel",
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

    dossier_only = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        sections=_sections("dossier"),
        owner_records=owners,
    )
    behavior_only = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        sections=_sections("behavior"),
        owner_records=owners,
    )
    assert b"Behavior observer marker" not in dossier_only
    assert b"Temperature section marker" not in behavior_only

    contact_document = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        sections=_sections("owners", "owner_contact"),
        owner_records=owners,
    )
    assert b"contact-marker@example.com" in contact_document


async def test_pdf_period_filters_measurements_care_and_behavior(
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
    for occurred_at, marker in ((old, "old-behavior-marker"), (recent, "recent-behavior-marker")):
        await storage.async_add_record(
            litter_id,
            record_type="behavior_observation",
            puppy_id=puppy_id,
            occurred_at=occurred_at.isoformat(),
            data={"scores": {"curiosity": 4}, "observer": marker},
        )

    document = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        range_hours=24,
        sections=_sections("measurements", "care", "behavior"),
    )

    assert b"recent-weight-marker" in document
    assert b"old-weight-marker" not in document
    assert b"recent-care-marker" in document
    assert b"old-care-marker" not in document
    assert b"recent-behavior-marker" in document
    assert b"old-behavior-marker" not in document


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
        "placements": {litter_id: {
            "placement_status": "reserved",
            "payment_status": "registration_fee",
            "payment_method": "bank_transfer",
        }},
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


def test_puppy_pdf_uses_only_the_owners_matching_litter_dossier(storage, install_litter):
    first, first_pup = install_litter(litter_id="first", puppy_id="first-pup", puppy_overrides={"owner_ids": ["o1"]})
    second, second_pup = install_litter(litter_id="second", puppy_id="second-pup", puppy_overrides={"owner_ids": ["o1"]})
    owner = {"id": "o1", "name": "Alex", "placements": {
        first: {"payment_amount": "1234.56", "payment_balance": "1111.11", "placement_status": "reserved"},
        second: {"payment_amount": "2345.67", "payment_balance": "0", "payment_status": "full"},
    }, "unassigned_placement": {"payment_amount": "9876.54"}}
    for litter, puppy, included, excluded in [
        (first, first_pup, b"1234.56", b"2345.67"),
        (second, second_pup, b"2345.67", b"1234.56"),
    ]:
        document = _pdf_bytes(storage, litter, puppy_id=puppy, sections=_sections("owners"), owner_records=[owner])
        assert included in document
        assert excluded not in document
        assert b"9876.54" not in document


def test_pdf_identity_section_contains_contract_fields(
    monkeypatch,
    storage,
    install_litter,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter(
        puppy_overrides={
            "registered_name": "Milky Way Aurora",
            "coat_color": "Caramel",
            "breed": "Multi-generation Australian Labradoodle",
            "chip_number": "000123",
        },
        litter_overrides={
            "father_details": {
                "registered_name": "Doodle Cooper Star",
                "call_name": "Dutch",
                "birth_date": "2021-02-03",
                "breed": "Multi-generation Australian Labradoodle",
                "wala_number": "WALA-FATHER",
                "chip_number": "000987654321098",
            },
            "mother_id": "mother-luna",
        },
    )
    storage._data["mothers"] = {
        "mother-luna": {
            "name": "Luna", "chip_number": "000123456789012"
        }
    }

    document = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        sections=_sections("identity"),
    )

    for marker in (
        b"Milky Way Aurora",
        b"Nestnaam",
        b"Caramel",
        b"Multi-generation Australian Labradoodle",
        b"000123",
        b"Doodle Cooper Star",
        b"WALA-FATHER",
        b"000987654321098",
        b"000123456789012",
    ):
        assert marker in document
    without_identity = _pdf_bytes(
        storage, litter_id, puppy_id=puppy_id, sections=_sections("summary")
    )
    assert b"000987654321098" not in without_identity
    assert b"000123456789012" not in without_identity


def test_pdf_owner_contact_uses_split_address_fields(
    monkeypatch,
    storage,
    install_litter,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter(puppy_overrides={"owner_ids": ["owner-1"]})
    document = _pdf_bytes(
        storage,
        litter_id,
        puppy_id=puppy_id,
        sections=_sections("owners", "owner_contact"),
        owner_records=[{
            "id": "owner-1",
            "name": "Alex",
            "street": "Dorpsstraat 12",
            "postal_code": "1234 AB",
            "city": "Amsterdam",
        }],
    )

    assert b"Dorpsstraat 12" in document
    assert b"1234 AB" in document
    assert b"Amsterdam" in document


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
            "recurring_completion": "none",
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
    assert "recurring" not in (dutch + english).lower()


def test_feeding_category_is_translated_in_pdf_data() -> None:
    record = {"type": "feeding", "data": {"feeding_category": "bottle", "feeding_type": "Own recipe"}}
    assert "Voedingscategorie: Fles" in pdf_export._record_data_text(record, "nl")
    assert "Feeding category: Bottle" in pdf_export._record_data_text(record, "en")
    assert "Own recipe" in pdf_export._record_data_text(record, "nl")
    for category, dutch, english in (
        ("kibble", "Brokken", "Kibble"),
        ("fresh_meat", "Vers vlees", "Fresh meat"),
        ("shelf_stable_meat", "Houdbaar vlees", "Shelf-stable meat"),
    ):
        record["data"]["feeding_category"] = category
        assert f"Voedingscategorie: {dutch}" in pdf_export._record_data_text(record, "nl")
        assert f"Feeding category: {english}" in pdf_export._record_data_text(record, "en")


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


def test_nested_headings_stay_with_compact_identity_table() -> None:
    report = pdf_export._PdfReport()
    report.paragraph("Previous section")
    report.y = pdf_export.PAGE_HEIGHT - pdf_export.MARGIN - 80
    report.heading("Nova", level=2)
    report.heading("Identity details", level=3)
    report.table(
        ["Field", "Value"],
        [["Name", "Nova"], ["Chip", "123456789012345"], ["Collar", "Purple"]],
        [130, 351],
        keep_together=True,
    )
    assert len(report.pages) == 2
    assert b"Nova" not in report.pages[0].operations
    for marker in (b"Nova", b"Identity details", b"Field", b"Chip", b"Purple"):
        assert marker in report.pages[1].operations


def test_dossier_heading_source_and_first_record_stay_together() -> None:
    report = pdf_export._PdfReport()
    report.paragraph("Previous section")
    report.y = pdf_export.PAGE_HEIGHT - pdf_export.MARGIN - 55
    report.heading("Dossier items", level=2)
    report.paragraph("Source: Nova", size=8, keep_with_next=True)
    report.table(["Date", "Note"], [["2026-10-22", "First record"]], [90, 391])
    assert len(report.pages) == 2
    for marker in (b"Dossier items", b"Source: Nova", b"First record"):
        assert marker not in report.pages[0].operations
        assert marker in report.pages[1].operations


def test_normal_multiline_record_moves_intact_to_next_page() -> None:
    report = pdf_export._PdfReport()
    bottom = pdf_export.PAGE_HEIGHT - pdf_export.MARGIN
    report.y = bottom - 80
    note = " ".join(f"recordfragment{index:02d}" for index in range(40))
    report.table(["Date", "Note"], [["First", "Short"], ["Second", note]], [90, 391])
    assert len(report.pages) == 2
    assert b"First" in report.pages[0].operations
    assert b"recordfragment" not in report.pages[0].operations
    assert b"Second" in report.pages[1].operations
    assert b"recordfragment39" in report.pages[1].operations
    assert all(b"(Date)" in page.operations for page in report.pages)


def test_long_first_record_keeps_heading_and_header_with_initial_chunk() -> None:
    report = pdf_export._PdfReport()
    report.paragraph("Previous section")
    report.y = pdf_export.PAGE_HEIGHT - pdf_export.MARGIN - 40
    report.heading("Long record", level=2)
    note = " ".join(f"fragment{index:04d}" for index in range(1500))
    report.table(["Date", "Note"], [["2026-10-22", note]], [90, 391], keep_together=True)
    assert b"Long record" not in report.pages[0].operations
    assert b"Long record" in report.pages[1].operations
    assert b"fragment0000" in report.pages[1].operations
    assert b"fragment1499" in report.build()
    assert all(b"(Date)" in page.operations for page in report.pages[1:])


def test_wrapped_heading_and_empty_state_do_not_leave_an_orphan() -> None:
    report = pdf_export._PdfReport()
    report.paragraph("Previous section")
    report.y = pdf_export.PAGE_HEIGHT - pdf_export.MARGIN - 45
    report.heading("Long puppy name " * 8, level=2)
    report.paragraph("No records available.")
    assert b"Long puppy" not in report.pages[0].operations
    assert b"No records available." in report.pages[-1].operations
    assert report.y <= pdf_export.PAGE_HEIGHT - pdf_export.MARGIN


def test_litter_only_dossier_does_not_emit_empty_puppy_headings(storage, install_litter) -> None:
    litter_id, _puppy_id = install_litter(puppy_overrides={"name": "Puppy without printed sections"})
    document = _pdf_bytes(
        storage, litter_id, sections=_sections("dossier"), dossier_scopes=["litter"],
    )
    assert b"Puppy without printed sections" not in document
    assert b"Dossieritems" in document


@pytest.mark.parametrize("language", ["nl", "en"])
def test_chart_has_regular_weight_ticks_date_grid_and_collar_color(monkeypatch, language) -> None:
    _freeze_time(monkeypatch)
    report = pdf_export._PdfReport()
    color = pdf_export._collar_rgb("paars", 0)
    assert report.chart([("Nova", [
        {"timestamp": "2026-08-31T12:00:00Z", "weight": 360},
        {"timestamp": "2026-10-22T12:00:00Z", "weight": 4130},
    ], color)], language)
    document = report.build()
    for value in range(0, 5001, 1000):
        assert f"({value} g)".encode() in document
    assert document.count(b"0.880 G 0.40 w") == 6
    assert document.count(b"0.920 G 0.40 w") == 5
    assert (b"31-08-2026" if language == "nl" else b"2026-08-31") in document
    assert (b"22-10-2026" if language == "nl" else b"2026-10-22") in document
    assert f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} RG".encode() in document


def test_single_point_chart_has_one_time_tick_and_ignores_invalid_points(monkeypatch) -> None:
    _freeze_time(monkeypatch)
    report = pdf_export._PdfReport()
    assert report.chart([("Nova", [
        {"timestamp": "invalid", "weight": 400},
        {"timestamp": NOW.isoformat(), "weight": float("nan")},
        {"timestamp": NOW.isoformat(), "weight": 410},
    ], (0.5, 0.2, 0.6))])
    document = report.build()
    assert document.count(b"0.920 G 0.40 w") == 1
    assert b"12:00" in document
    assert b"4 4 re f" in document
    assert b"nan" not in document and b"inf" not in document
    assert len(report.pages) == 1


def test_chart_and_wrapped_legend_move_together_to_next_page() -> None:
    report = pdf_export._PdfReport()
    report.paragraph("Previous section")
    report.y = pdf_export.PAGE_HEIGHT - pdf_export.MARGIN - 100
    report.chart([
        (f"Puppy {index} with a long registered name", [{"timestamp": NOW.isoformat(), "weight": 410 + index}], (0.2, 0.3, 0.4))
        for index in range(12)
    ])
    assert len(report.pages) == 2
    assert b"Gewichtsontwikkeling" not in report.pages[0].operations
    assert b"Gewichtsontwikkeling" in report.pages[1].operations
    assert b"Puppy 11" in report.pages[1].operations
    assert report.y <= pdf_export.PAGE_HEIGHT - pdf_export.MARGIN


@pytest.mark.parametrize("language", ["nl", "en"])
async def test_full_pdf_layout_with_care_instructions(
    monkeypatch, storage, install_litter, make_measurement, tmp_path, language,
) -> None:
    end = datetime(2026, 10, 22, 12, tzinfo=UTC)
    monkeypatch.setattr(pdf_export.dt_util, "now", lambda: end)
    monkeypatch.setattr(pdf_export.dt_util, "as_local", lambda value: value)
    start = end - timedelta(days=52)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement(str(day), 360 + day * 72.5, (start + timedelta(days=day)).isoformat())
            for day in range(53)
        ],
        puppy_overrides={
            "name": "Nova", "collar_color": "paars", "registered_name": "Milky Way Nova",
            "coat_color": "Bruin", "chip_number": "123456789012345", "owner_ids": ["owner-1"],
            "birth_time": start.isoformat(), "birth_weight": 360,
        },
        litter_overrides={"birth_date": start.date().isoformat()},
    )
    for day in range(3, 18):
        for program in ("ENS", "ESI"):
            await storage.async_add_record(
                litter_id, puppy_id=puppy_id, record_type="test", title=program,
                occurred_at=(start + timedelta(days=day, hours=1 if program == "ENS" else 2)).isoformat(),
                data={
                    "care_occurrence_id": f"{program}:{day}", "care_status": "completed",
                    "care_age_days": day, "care_result": "Rustig, herstelt snel",
                    "care_instruction": "Observeer de reactie en geef daarna rust. " * (8 if program == "ENS" else 1),
                },
                note=f"Observatie dag {day}: snuffelt en zoekt daarna contact.",
            )
    await storage.async_add_record(litter_id, record_type="milestone", occurred_at=end.isoformat(), note="Alle pups boven 1 kg.")
    await storage.async_add_record(litter_id, puppy_id=puppy_id, record_type="note", occurred_at=end.isoformat(), note="Einde van het pupdossier.")
    report = pdf_export._PdfReport
    captured = []

    def capture(*args, **kwargs):
        instance = report(*args, **kwargs)
        captured.append(instance)
        return instance

    monkeypatch.setattr(pdf_export, "_PdfReport", capture)
    document = _pdf_bytes(
        storage, litter_id, puppy_id=puppy_id, language=language,
        sections=_sections("identity", "summary", "chart", "care", "dossier", "owners", "owner_contact", "brand_logo", "breeder_name"),
        branding={"name": "Voorbeeldfokker"},
        owner_records=[{"id": "owner-1", "name": "Voorbeeldbaasje", "email": "example@example.com"}],
    )
    (tmp_path / f"puppy-layout-{language}.pdf").write_bytes(document)
    pages = [bytes(page.operations) for page in captured[0].pages]
    identity = b"Identiteitsgegevens" if language == "nl" else b"Identity details"
    page = next(page for page in pages if identity in page)
    assert b"(Nova)" in page and b"123456789012345" in page
    assert b"Einde van het pupdossier." in document
    assert len(pages) >= 3
