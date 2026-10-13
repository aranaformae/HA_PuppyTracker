"""Tests for CSV, JSON and direct PDF export behavior."""

from __future__ import annotations

import base64
import csv
import io
import json
from datetime import datetime, timezone

from custom_components.puppy_tracker import api, pdf_export
from custom_components.puppy_tracker.backup import parse_export_json


NOW = datetime(2026, 8, 30, 12, 0, tzinfo=timezone.utc)


def _freeze_time(monkeypatch) -> None:
    monkeypatch.setattr(api.dt_util, "now", lambda: NOW)
    monkeypatch.setattr(pdf_export.dt_util, "now", lambda: NOW)
    monkeypatch.setattr(pdf_export.dt_util, "as_local", lambda value: value)


def test_csv_exports_only_effective_measurements(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _freeze_time(monkeypatch)
    old = make_measurement(
        "old",
        400,
        "2026-08-29T10:00:00+00:00",
        superseded_by="corrected",
    )
    corrected = make_measurement(
        "corrected",
        420,
        "2026-08-29T10:00:00+00:00",
        source_measurement_id="old",
    )
    deleted = make_measurement(
        "deleted",
        430,
        "2026-08-30T10:00:00+00:00",
        deleted=True,
    )
    litter_id, _puppy_id = install_litter(measurements=[deleted, old, corrected])

    _filename, mime, content = api._csv_export(storage, litter_id)
    rows = list(csv.DictReader(io.StringIO(content), delimiter=";"))

    assert mime == "text/csv;charset=utf-8"
    assert [row["measurement_id"] for row in rows] == ["corrected"]
    assert rows[0]["weight_g"] == "420.0"


def test_csv_includes_contract_identity_fields(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, _puppy_id = install_litter(
        measurements=[make_measurement("a", 420, "2026-08-30T10:00:00+00:00")],
        puppy_overrides={
            "registered_name": "Milky Way Aurora",
            "coat_color": "Caramel",
            "breed": "Multi-generation Australian Labradoodle",
        },
        litter_overrides={
            "father_details": {
                "registered_name": "Doodle Cooper Star",
                "call_name": "Dutch",
                "birth_date": "2021-02-03",
                "breed": "Multi-generation Australian Labradoodle",
                "wala_number": "WALA-FATHER",
            },
        },
    )

    _filename, _mime, content = api._csv_export(storage, litter_id)
    row = next(csv.DictReader(io.StringIO(content), delimiter=";"))

    assert row["puppy_registered_name"] == "Milky Way Aurora"
    assert row["coat_color"] == "Caramel"
    assert row["puppy_breed"] == "Multi-generation Australian Labradoodle"
    assert row["father_registered_name"] == "Doodle Cooper Star"
    assert row["father_wala_number"] == "WALA-FATHER"


def test_csv_can_filter_to_one_puppy(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[make_measurement("a", 420, "2026-08-30T10:00:00+00:00")]
    )
    litter = storage._data["litters"][litter_id]
    litter["puppies"]["puppy-2"] = {
        **litter["puppies"][puppy_id],
        "id": "puppy-2",
        "name": "Geel",
        "measurements": [
            make_measurement("b", 430, "2026-08-30T11:00:00+00:00")
        ],
    }

    _filename, _mime, content = api._csv_export(
        storage,
        litter_id,
        puppy_id="puppy-2",
    )
    rows = list(csv.DictReader(io.StringIO(content), delimiter=";"))

    assert len(rows) == 1
    assert rows[0]["puppy_id"] == "puppy-2"
    assert rows[0]["measurement_id"] == "b"


def test_litter_payload_exposes_contract_identity(storage, install_litter) -> None:
    litter_id, puppy_id = install_litter(
        puppy_overrides={
            "registered_name": "Milky Way Aurora",
            "coat_color": "Caramel",
            "breed": "Multi-generation Australian Labradoodle",
        },
        litter_overrides={
            "father_details": {
                "registered_name": "Doodle Cooper Star",
                "call_name": "Dutch",
                "birth_date": "2021-02-03",
                "breed": "Multi-generation Australian Labradoodle",
                "wala_number": "WALA-FATHER",
            },
        },
    )

    payload = api._litter_payload(storage, litter_id)
    puppy = next(item for item in payload["puppies"] if item["id"] == puppy_id)

    assert puppy["registered_name"] == "Milky Way Aurora"
    assert puppy["coat_color"] == "Caramel"
    assert payload["litter"]["father_details"]["registered_name"] == (
        "Doodle Cooper Star"
    )


def test_json_preserves_full_measurement_history_and_litter_audit(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _freeze_time(monkeypatch)
    old = make_measurement(
        "old",
        400,
        "2026-08-29T10:00:00+00:00",
        superseded_by="new",
    )
    new = make_measurement(
        "new",
        420,
        "2026-08-29T10:00:00+00:00",
        source_measurement_id="old",
    )
    litter_id, puppy_id = install_litter(measurements=[old, new])
    storage._data["audit_log"] = [
        {"action": "correct_measurement", "litter_id": litter_id},
        {"action": "other", "litter_id": "another-litter"},
    ]

    _filename, mime, content = api._json_export(storage, litter_id)
    document = json.loads(content)
    parse_export_json(content)

    measurements = document["litter"]["puppies"][puppy_id]["measurements"]
    assert mime == "application/json;charset=utf-8"
    assert document["export_version"] == 5
    assert document["scope"] == "litter"
    assert {item["id"] for item in measurements} == {"old", "new"}
    assert document["audit_log"] == [
        {"action": "correct_measurement", "litter_id": litter_id}
    ]


def test_pdf_export_returns_real_pdf_bytes(
    monkeypatch,
    storage,
    install_litter,
    make_measurement,
) -> None:
    _freeze_time(monkeypatch)
    litter_id, puppy_id = install_litter(
        measurements=[
            make_measurement("a", 400, "2026-08-29T10:00:00+00:00"),
            make_measurement("b", 430, "2026-08-30T10:00:00+00:00"),
        ]
    )

    filename, mime, encoded = pdf_export.build_pdf_export(
        storage,
        litter_id,
        puppy_id=puppy_id,
    )
    raw = base64.b64decode(encoded)

    assert filename.endswith(".pdf")
    assert mime == "application/pdf"
    assert raw.startswith(b"%PDF-1.4")
    assert b"%%EOF" in raw[-64:]
    assert len(raw) > 1000
