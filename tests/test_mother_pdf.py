"""Mother PDF content switches, scope boundaries and actual WebSocket policy."""

import base64
from copy import deepcopy
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from homeassistant.auth.const import GROUP_ID_ADMIN, GROUP_ID_READ_ONLY
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.mother_dashboard_api import async_setup_mother_dashboard_api
from custom_components.puppy_tracker.mother_pdf import MOTHER_PDF_SECTIONS, build_mother_pdf
from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData

NOW = datetime(2026, 11, 2, 12, tzinfo=UTC)


@pytest.fixture
def mother_pdf_data():
    def record(key, kind="note", litter="current", data=None, note="", days=0, **overrides):
        return {"id": key, "litter_id": litter, "mother_id": "m1", "scope": "mother", "type": kind,
                "title": key, "occurred_at": (NOW - timedelta(days=days)).isoformat(),
                "data": data or {}, "note": note, "deleted": False, **overrides}
    return {"litters": {
        "current": {"id": "current", "name": "Current Litter", "mother_id": "m1", "birth_date": "2026-10-20", "puppies": {"pup": {"name": "PRIVATE PUPPY", "records": [{"note": "PRIVATE PUPPY RECORD"}]}}},
        "old": {"id": "old", "name": "Old Litter", "mother_id": "m1", "birth_date": "2025-10-20"},
        "foreign": {"id": "foreign", "name": "FOREIGN LITTER", "mother_id": "m2"},
    }, "mothers": {
        "m1": {"id": "m1", "name": "Luna", "registered_name": "LUNA REGISTERED", "chip_number": "CHIP-123", "birth_date": "2020-01-01", "breed": "Labradoodle", "wala_number": "WALA-123", "profile_note": "PROFILE NOTE", "records": [
            record("ordinary-note", note="ORDINARY NOTE"),
            record("old-history", litter="old", note="OLD HISTORY", days=500),
            record("temp-a", "temperature", data={"temperature_c": 38.1, "method": "rectal"}, note="TEMP NOTE A"),
            record("temp-b", "temperature", data={"temperature_c": 38.6}, note="TEMP NOTE B"),
            record("temp-old", "temperature", litter="old", data={"temperature_c": 38.4}, note="OLD TEMPERATURE", days=500),
            record("reminder-execution", "medication", data={"medication": "MEDICINE", "dose": "1 ml", "recurring_reminder_id": "r1"}, note="CARE NOTE"),
            record("care-result", "test", data={"care_occurrence_id": "c1", "care_status": "completed", "care_result": "Calm", "care_instruction": "DAILY INSTRUCTION", "care_score": 3}),
            record("deleted", note="DELETED NOTE", deleted=True),
            record("wrong-owner", note="WRONG OWNER", mother_id="m2"),
            record("wrong-scope", note="WRONG SCOPE", scope="puppy"),
        ]},
        "m2": {"id": "m2", "name": "OTHER MOTHER", "records": [record("foreign-note", note="FOREIGN RECORD", mother_id="m2", litter="foreign")]},
    }, "settings": {"owners": [{"name": "PRIVATE BUYER", "email": "PRIVATE EMAIL", "payment": "PRIVATE PAYMENT"}]}}


def pdf(data, monkeypatch, **options):
    monkeypatch.setattr("custom_components.puppy_tracker.mother_pdf.dt_util.now", lambda: NOW)
    filename, mime, encoded = build_mother_pdf(data, "current", **options)
    assert filename.startswith("puppy-tracker-mother-luna-")
    assert mime == "application/pdf"
    result = base64.b64decode(encoded)
    assert result.startswith(b"%PDF-1.4")
    return result


def only(*keys):
    return {key: key in keys for key in MOTHER_PDF_SECTIONS}


@pytest.mark.parametrize("scope", ["all", "current"])
@pytest.mark.parametrize("language", ["nl", "en"])
def test_mother_pdf_scopes_and_privacy(mother_pdf_data, monkeypatch, scope, language):
    before = deepcopy(mother_pdf_data)
    document = pdf(mother_pdf_data, monkeypatch, history_scope=scope, language=language,
                   sections={"litter_context": True, "profile_note": True})
    for private in (b"PRIVATE PUPPY", b"PRIVATE BUYER", b"PRIVATE EMAIL", b"PRIVATE PAYMENT", b"OTHER MOTHER", b"FOREIGN RECORD", b"WRONG OWNER", b"WRONG SCOPE", b"DELETED NOTE"):
        assert private not in document
    assert b"ORDINARY NOTE" in document and b"TEMP NOTE A" in document and b"CARE NOTE" in document
    assert b"DAILY INSTRUCTION" in document and b"PROFILE NOTE" in document
    assert (b"OLD HISTORY" in document) is (scope == "all")
    assert (b"Old Litter" in document) is (scope == "all")
    assert (b"OLD TEMPERATURE" in document) is (scope == "all")
    assert mother_pdf_data == before


@pytest.mark.parametrize("section,marker", [
    ("identity", b"CHIP-123"), ("summary", b"Mother history summary"),
    ("chart", b"Temperature development"), ("measurements", b"Temperature measurements"),
    ("care", b"Completed care and reminders"), ("dossier", b"ORDINARY NOTE"),
    ("litter_context", b"Litter context"), ("brand_logo", b"/Subtype /Image"),
    ("breeder_name", b"BREEDER NAME"), ("breeder_contact", b"BREEDER CONTACT"),
])
def test_mother_sections_are_independent(mother_pdf_data, monkeypatch, section, marker):
    branding = {"name": "BREEDER NAME", "contact": "BREEDER CONTACT"}
    selected = pdf(mother_pdf_data, monkeypatch, sections=only(section), language="en", branding=branding)
    assert marker in selected
    assert marker not in pdf(mother_pdf_data, monkeypatch, sections=only(), language="en", branding=branding)
    if section != "identity":
        assert b"CHIP-123" not in selected
    if section not in {"dossier"}:
        assert b"ORDINARY NOTE" not in selected
    if section != "measurements":
        assert b"TEMP NOTE A" not in selected
    if section != "care":
        assert b"CARE NOTE" not in selected


def test_mother_pdf_period_category_empty_and_profile_note_filters(mother_pdf_data, monkeypatch):
    document = pdf(mother_pdf_data, monkeypatch, range_hours=24, dossier_types=[])
    assert b"OLD HISTORY" not in document and b"ORDINARY NOTE" not in document
    assert b"TEMP NOTE A" in document and b"CARE NOTE" in document
    assert b"PROFILE NOTE" not in pdf(mother_pdf_data, monkeypatch, sections=only("profile_note"))
    assert b"PROFILE NOTE" in pdf(mother_pdf_data, monkeypatch, sections=only("identity", "profile_note"))
    mother_pdf_data["mothers"]["m1"]["records"] = []
    empty = pdf(mother_pdf_data, monkeypatch, language="en")
    assert b"No records in this period" in empty
    assert b"No valid temperature measurements" in empty


def test_same_time_temperature_entries_keep_their_own_values(mother_pdf_data, monkeypatch):
    document = pdf(mother_pdf_data, monkeypatch, sections=only("measurements"), language="en")
    assert b"38.1" in document and b"38.6" in document


def test_mother_long_note_continues_across_pages(mother_pdf_data, monkeypatch):
    import re

    mother_pdf_data["mothers"]["m1"]["records"] = [{
        "id": "long-note", "type": "note", "scope": "mother", "mother_id": "m1",
        "litter_id": "current", "occurred_at": NOW.isoformat(), "data": {},
        "note": "Long mother observation. " * 500 + "END OF MOTHER NOTE",
    }]
    document = pdf(mother_pdf_data, monkeypatch, sections=only("dossier"), language="en")
    assert len(re.findall(rb"/Type /Page\b", document)) > 1
    assert b"END OF MOTHER NOTE" in document


@pytest.mark.parametrize("admin", [True, False])
async def test_mother_pdf_websocket_permissions_and_scope(hass, storage, install_litter, mother_pdf_data, hass_ws_client, monkeypatch, admin):
    main = MotherScopeStorage(hass)
    main._data = deepcopy(storage.get_data())
    main._data.update(deepcopy(mother_pdf_data))
    main.async_save = AsyncMock()
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = PuppyTrackerRuntimeData(storage=main)
    entry.add_to_hass(hass)
    async_setup_mother_dashboard_api(hass)
    user = await hass.auth.async_create_user("PDF reader", group_ids=[GROUP_ID_ADMIN if admin else GROUP_ID_READ_ONLY])
    token = await hass.auth.async_create_refresh_token(user, client_id="https://test.client")
    client = await hass_ws_client(hass, access_token=hass.auth.async_create_access_token(token))
    await client.send_json_auto_id({"type": f"{DOMAIN}/mother/pdf", "litter_id": "current", "history_scope": "current", "language": "en", "sections": only("dossier")})
    response = await client.receive_json()
    assert response["success"] is admin
    if admin:
        document = base64.b64decode(response["result"]["content"])
        assert b"ORDINARY NOTE" in document and b"OLD HISTORY" not in document
        assert response["result"]["encoding"] == "base64"
    else:
        assert response["error"]["code"] == "unauthorized"
