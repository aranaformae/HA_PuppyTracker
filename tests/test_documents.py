"""Executable document workflow, immutable archives and portable restore."""

import base64
from copy import deepcopy
import json
from hashlib import sha256
from unittest.mock import AsyncMock

import pytest
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker import document_api
from custom_components.puppy_tracker.backup import BackupValidationError, async_apply_import, build_export_document, parse_export_json, prepare_import
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.document_pdf import BODY_BOTTOM, DocumentPdf, build_document_pdf
from custom_components.puppy_tracker.document_templates import BUILTIN_TEMPLATE_ID, BUILTIN_TEMPLATE_IDS, FIELDS, built_in_template, built_in_templates, document_context, fingerprint, normalize_template, render_text, template_fields, validate_document_settings
from custom_components.puppy_tracker.owners import OwnerStore
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData


def simple_template(**changes):
    return normalize_template({"format": "puppy_tracker_document_template", "version": 1,
        "name": "Test contract", "language": "nl", "logo": False,
        "blocks": [{"type": "heading", "text": "Partijen"},
                   {"type": "text", "text": "{{ koper.naam }} koopt {{ pup.naam }} voor {{ betaling.totaal }}."},
                   {"type": "signature", "text": "{{ contract.plaats }} · {{ contract.datum }}"}], **changes})


@pytest.fixture
async def setup_documents(hass, storage, tmp_path, install_litter):
    storage.files.config_root = tmp_path.resolve()
    storage.files.root = tmp_path.resolve() / "puppy_tracker" / "files"
    owners = OwnerStore(hass)
    owners._store.async_save = AsyncMock()
    owner = await owners.async_upsert({"name": "Alex Example", "street": "Teststraat 1", "phone": "0612345678",
        "litter_id": "litter-1", "payment_amount": "2500", "registration_fee_amount": "150", "deposit_amount": "350"})
    litter_id, puppy_id = install_litter(puppy_overrides={"name": "Nova", "owner_ids": [owner["id"]]})
    await owners.async_upsert({"litter_id": "other", "payment_amount": "9999"}, owner["id"])
    storage._data["settings"]["document_templates"] = {"test": simple_template()}
    entry = MockConfigEntry(domain=DOMAIN)
    entry.runtime_data = PuppyTrackerRuntimeData(storage=storage, owners=owners)
    entry.add_to_hass(hass)
    document_api.async_setup_document_api(hass)
    return owners, {"template_id": "test", "litter_id": litter_id, "puppy_id": puppy_id,
                    "owner_ids": [owner["id"]], "details": {"date": "2026-10-24", "place": "Teststad"}}


@pytest.fixture
async def document_client(hass, hass_ws_client, setup_documents):
    return await hass_ws_client(hass)


async def request(client, action, **data):
    await client.send_json_auto_id({"type": f"puppy_tracker/documents/{action}", **data})
    return await client.receive_json()


async def save_document(client, selection, request_id="first"):
    preview = await request(client, "preview", **selection)
    assert preview["success"], preview
    assert preview["result"]["missing"] == []
    args = {**selection, "request_id": request_id, "expected_fingerprint": preview["result"]["fingerprint"]}
    saved = await request(client, "save", **args)
    assert saved["success"], saved
    return saved["result"], args


def test_template_rejects_expressions_unknown_fields_and_invalid_structure():
    for text in ("{{ pup.unknown }}", "{{ __import__('os') }}", "{% if true %}", "{{ pup.naam"):
        with pytest.raises(ValueError):
            simple_template(blocks=[{"type": "text", "text": text}])
    for changes in ({"version": True}, {"blocks": []}, {"logo": "false"}, {"extra": 1}, {"watermark_type": "image-url"}, {"watermark_text": "x" * 151},
                    {"blocks": [{"type": "data"}]}, {"name": "x" * 151}):
        with pytest.raises(ValueError):
            simple_template(**changes)
    assert render_text("{{ pup.naam }} {{ pup.chipnummer }}", {"pup.naam": "Nova"}, ["pup.chipnummer"], "nl") == "Nova n.v.t."
    assert render_text("{{ pup.naam }}", {}, [], "en") == "[MISSING]"
    legacy = simple_template(watermark=True)
    assert "watermark_type" not in legacy and "watermark_text" not in legacy
    assert fingerprint(normalize_template(legacy)) == fingerprint(legacy)


def test_original_dutch_handover_example_remains_unchanged():
    template = built_in_template()
    assert template["name"] == "Overdrachtsbewijs"
    assert [b["type"] for b in template["blocks"]] == ["heading", "data", "text", "signature"]
    assert template_fields(template) == {"koper.naam", "pup.naam", "pup.chipnummer", "overdracht.datum", "contract.plaats", "contract.datum"}


def test_standard_template_catalog_is_valid_paired_and_safe_to_copy():
    catalog = built_in_templates()
    assert len(catalog) == 12 and set(catalog) == BUILTIN_TEMPLATE_IDS
    for key, template in catalog.items():
        assert normalize_template(template) == template
        assert set(template["optional_fields"]) <= template_fields(template)
        assert template["language"] == key.rsplit("-", 1)[1]
        values = {field: label[0 if template["language"] == "nl" else 1] for field, label in FIELDS.items()}
        assert build_document_pdf({"template": template, "values": values}).startswith(b"%PDF-")
        sibling = catalog[key.rsplit("-", 1)[0] + ("-en" if template["language"] == "nl" else "-nl")]
        assert template_fields(sibling) == template_fields(template)
        assert sibling["optional_fields"] == template["optional_fields"]
    catalog[BUILTIN_TEMPLATE_ID]["name"] = "Modified copy"
    assert built_in_templates()[BUILTIN_TEMPLATE_ID]["name"] == "Overdrachtsbewijs"


def test_payment_receipt_requires_manual_confirmation_of_actual_payment():
    for language, labels in (("nl", ("Werkelijk ontvangen bedrag", "Datum ontvangst", "Handtekening ontvanger")),
                             ("en", ("Amount actually received", "Date received", "Recipient's signature"))):
        template = built_in_template(f"payment-receipt-{language}")
        assert template_fields(template) == {"fokker.naam", "koper.naam", "pup.naam", "contract.datum"}
        text = "\n".join(block["text"] for block in template["blocks"])
        assert all(label in text for label in labels)
        assert "betaling.totaal" not in text and "betaling.slotbetaling" not in text


async def test_all_builtin_templates_are_protected_but_can_be_copied(document_client, storage):
    for key, template in built_in_templates().items():
        result = await request(document_client, "template/save", template_id=key, template=template)
        assert not result["success"] and result["error"]["message"] == "copy_builtin_template"
        result = await request(document_client, "template/delete", template_id=key, expected_revision=fingerprint(template))
        assert not result["success"] and result["error"]["message"] == "copy_builtin_template"
        with pytest.raises(ValueError):
            validate_document_settings({"document_templates": {key: template}})
    copied = built_in_template("payment-overview-en")
    copied["name"] = "My payment overview"
    result = await request(document_client, "template/save", template_id="my-copy", template=copied)
    assert result["success"]
    assert storage.get_settings()["document_templates"]["my-copy"]["name"] == "My payment overview"
    assert built_in_template("payment-overview-en")["name"] == "Payment overview"


async def test_context_uses_selected_litter_and_requires_every_buyer_contact(setup_documents, storage):
    owners, selection = setup_documents
    context = document_context(storage, owners, selection["litter_id"], selection["puppy_id"], selection["owner_ids"], selection["details"], "nl")
    assert context["betaling.totaal"] == "€ 2.500,00"
    assert context["betaling.slotbetaling"] == "€ 2.000,00"
    assert context["koper.telefoon"] == "0612345678"
    assert context["pup.geboortedatum"] == "28-08-2026"
    second = await owners.async_upsert({"name": "Sam Example"})
    with pytest.raises(ValueError, match="choose_document_parties"):
        document_context(storage, owners, selection["litter_id"], selection["puppy_id"], [second["id"]], {}, "nl")
    storage._data["litters"][selection["litter_id"]]["puppies"][selection["puppy_id"]]["owner_ids"].append(second["id"])
    context = document_context(storage, owners, selection["litter_id"], selection["puppy_id"], [*selection["owner_ids"], second["id"]], {}, "nl")
    assert context["koper.naam"] == "Alex Example / Sam Example"
    assert context["koper.telefoon"] == ""  # Never silently omit an incomplete buyer.


async def test_parent_fields_and_known_zero_amounts(setup_documents, storage):
    owners, selection = setup_documents
    litter = storage._data["litters"][selection["litter_id"]]
    litter["father_details"] = {"chip_number": "000000000000001", "registered_name": "Example father"}
    litter["mother_id"] = "mother-1"
    storage._data.setdefault("mothers", {})["mother-1"] = {"chip_number": "000000000000002", "registered_name": "Example mother"}
    await owners.async_upsert({"litter_id": selection["litter_id"], "deposit_amount": "0", "registration_fee_amount": "0"}, selection["owner_ids"][0])
    values = document_context(storage, owners, selection["litter_id"], selection["puppy_id"], selection["owner_ids"], {}, "en")
    assert values["vader.chipnummer"] == "000000000000001"
    assert values["moeder.chipnummer"] == "000000000000002"
    assert values["vader.nestnaam"] == "Example father"
    assert values["betaling.aanbetaling"] == "€ 0.00"
    assert values["betaling.slotbetaling"] == "€ 2,500.00"


async def test_missing_values_block_final_save_until_explicitly_optional(document_client, setup_documents, storage):
    _, selection = setup_documents
    selection["details"]["place"] = ""
    preview = (await request(document_client, "preview", **selection))["result"]
    assert preview["missing"] == ["contract.plaats"]
    result = await request(document_client, "save", **selection, expected_fingerprint=preview["fingerprint"], request_id="missing")
    assert not result["success"] and result["error"]["message"] == "document_missing_fields"
    assert storage.get_settings().get("documents", {}) == {}
    storage._data["settings"]["document_templates"]["test"]["optional_fields"] = ["contract.plaats"]
    await save_document(document_client, selection)


async def test_stale_preview_conflicts_and_archive_is_immutable_idempotent(document_client, setup_documents, storage):
    owners, selection = setup_documents
    preview = (await request(document_client, "preview", **selection))["result"]
    await owners.async_upsert({"name": "Updated buyer"}, selection["owner_ids"][0])
    result = await request(document_client, "save", **selection, expected_fingerprint=preview["fingerprint"], request_id="stale")
    assert result["error"]["message"] == "document_conflict"
    saved, args = await save_document(document_client, selection)
    assert saved["document"]["puppy_name"] == "Nova (groen)"
    await owners.async_upsert({"name": "Changed after signing"}, selection["owner_ids"][0])
    storage._data["settings"]["document_templates"]["test"]["name"] = "Changed template"
    downloaded = await request(document_client, "download", document_id="first")
    assert downloaded["result"] == saved["download"]
    assert (await request(document_client, "save", **args))["result"] == saved
    assert len(storage.get_settings()["documents"]) == 1
    entry = storage.get_settings()["documents"]["first"]
    snapshot = json.loads(await storage.files.async_read(entry["snapshot_id"]))
    assert snapshot["values"]["koper.naam"] == "Updated buyer"
    assert snapshot["template"]["name"] == "Test contract"


async def test_template_revision_delete_and_idempotent_creation(document_client, setup_documents, storage):
    original = simple_template()
    saved = await request(document_client, "template/save", template_id="mine", template=original)
    assert saved["success"]
    retry = await request(document_client, "template/save", template_id="mine", template=original)
    assert retry["success"] and retry["result"] == saved["result"]
    changed = simple_template(name="Changed")
    assert not (await request(document_client, "template/save", template_id="mine", template=changed))["success"]
    assert not (await request(document_client, "template/delete", template_id="mine", expected_revision="stale"))["success"]
    assert (await request(document_client, "template/delete", template_id="mine", expected_revision=fingerprint(original)))["success"]
    assert "mine" not in storage.get_settings()["document_templates"]
    assert not (await request(document_client, "template/delete", template_id=BUILTIN_TEMPLATE_ID, expected_revision=""))["success"]


async def test_template_catalog_contains_public_starters_and_user_templates(document_client):
    result = await request(document_client, "list")
    templates = result["result"]["templates"]
    assert {t["id"] for t in templates} == BUILTIN_TEMPLATE_IDS | {"test"}
    assert {t["id"] for t in templates if t["builtin"]} == BUILTIN_TEMPLATE_IDS
    assert [t["id"] for t in templates if not t["builtin"]] == ["test"]


async def test_unsaved_template_preview_uses_labels_without_mutating_data(document_client, setup_documents, storage):
    owners, _ = setup_documents
    before, owner_before = storage.get_data(), owners.get_backup_data()
    storage.async_save.reset_mock()
    owners._store.async_save.reset_mock()
    draft = simple_template(name="UNSAVED LAYOUT", blocks=[{"type": "data", "fields": ["pup.naam", "koper.naam", "betaling.totaal"]}])
    response = await request(document_client, "template/preview", template=draft)
    assert response["success"], response
    pdf = base64.b64decode(response["result"]["content"])
    assert pdf.startswith(b"%PDF-")
    assert b"UNSAVED LAYOUT" in pdf
    assert b"Nova" not in pdf and b"Alex Example" not in pdf and b"2.500" not in pdf
    assert storage.get_data() == before and owners.get_backup_data() == owner_before
    storage.async_save.assert_not_awaited()
    owners._store.async_save.assert_not_awaited()
    assert not storage.files.root.exists() or not list(storage.files.root.iterdir())
    draft["blocks"][0]["fields"].append("pup.unknown")
    assert not (await request(document_client, "template/preview", template=draft))["success"]


async def test_failed_archive_write_rolls_back_files_and_metadata(document_client, setup_documents, storage):
    _, selection = setup_documents
    preview = (await request(document_client, "preview", **selection))["result"]
    before = storage.get_data()
    storage.async_save.side_effect = OSError("disk full")
    result = await request(document_client, "save", **selection, expected_fingerprint=preview["fingerprint"], request_id="failed")
    assert not result["success"]
    assert storage.get_data() == before
    assert not list(storage.files.root.iterdir())


async def test_archive_full_backup_restore_and_corrupt_snapshot_rejection(document_client, setup_documents, storage):
    owners, selection = setup_documents
    storage._data["settings"]["document_templates"]["test"].update(watermark=True, watermark_type="text", watermark_text="ARCHIVE MARK")
    saved, _ = await save_document(document_client, selection)
    backup = build_export_document(storage, scope="full", file_data=await storage.async_export_managed_files(), owner_data=owners.get_backup_data(),
        care_reminder_settings={"lead_days": 5, "categories": {"vaccination": True, "deworming": True}},
        scheduler_data={"version": 1, "care_programs": {"programs": {}}, "recurring_reminders": {"reminders": {}}})
    assert backup["export_version"] == 7
    # Snapshot validation must reject invalid content even with matching checksums.
    invalid = deepcopy(backup)
    settings = invalid["data"]["settings"]
    old_id = settings["documents"]["first"]["snapshot_id"]
    blob = json.loads(base64.b64decode(invalid["file_data"][old_id]))
    blob["template"]["name"] = "Tampered without updating revision"
    content = json.dumps(blob).encode()
    new_id = sha256(content).hexdigest()
    settings["files"][new_id] = {**settings["files"].pop(old_id), "size": len(content)}
    del invalid["file_data"][old_id]
    invalid["file_data"][new_id] = base64.b64encode(content).decode()
    settings["documents"]["first"]["snapshot_id"] = new_id
    with pytest.raises(BackupValidationError):
        parse_export_json(json.dumps(invalid))
    invalid = deepcopy(backup)
    invalid["data"]["settings"]["documents"]["first"]["snapshot_id"] = "f" * 64
    with pytest.raises(BackupValidationError):
        parse_export_json(json.dumps(invalid))
    invalid = deepcopy(backup)
    invalid["export_version"] = 6
    with pytest.raises(BackupValidationError):
        parse_export_json(json.dumps(invalid))
    assert (await request(document_client, "delete", document_id="first"))["success"]
    assert not list(storage.files.root.iterdir())
    await async_apply_import(storage, prepare_import(storage, parse_export_json(json.dumps(backup)), mode="replace_all"))
    restored_template = storage.get_settings()["document_templates"]["test"]
    assert restored_template["watermark_type"] == "text" and restored_template["watermark_text"] == "ARCHIVE MARK"
    assert (await request(document_client, "download", document_id="first"))["result"] == saved["download"]
    assert base64.b64decode(saved["download"]["content"]).startswith(b"%PDF-")


def test_long_identity_rows_and_body_text_respect_pdf_page_bounds(monkeypatch):
    observed = []
    boxes = []
    draw = DocumentPdf.text
    rectangle = DocumentPdf.rect
    def track(self, x, top, text, **kwargs):
        # Watermark text uses a rotated coordinate system, not body coordinates.
        if not self.page.operations.startswith(b"q /WM gs"):
            observed.append((self.pages.index(self.page), top, text, kwargs.get("size", 10)))
        return draw(self, x, top, text, **kwargs)
    monkeypatch.setattr(DocumentPdf, "text", track)
    def track_rectangle(self, x, top, width, height, **kwargs):
        boxes.append((top, height))
        return rectangle(self, x, top, width, height, **kwargs)
    monkeypatch.setattr(DocumentPdf, "rect", track_rectangle)
    template = simple_template(blocks=[
        {"type": "heading", "text": "IDENTITY"},
        {"type": "data", "fields": ["koper.naam", "koper.straat"]},
        {"type": "text", "text": "Long paragraph " * 600},
        {"type": "signature", "text": "SIGN HERE"},
        {"type": "page_break"},
        {"type": "text", "text": "APPENDIX"},
    ], watermark=True)
    values = dict.fromkeys(FIELDS, "")
    values.update({"koper.naam": "Buyer " * 600, "koper.straat": "Example Street"})
    pdf = build_document_pdf({"template": template, "values": values})
    assert pdf.startswith(b"%PDF-") and pdf.rstrip().endswith(b"%%EOF")
    assert max(row[0] for row in observed) > 2
    assert all(0 <= top and top + size < 842 for _, top, _, size in observed)
    assert all(top < 777 for _, top, text, _ in observed if "Paraaf" not in text and " / " not in text)
    assert boxes and all(top + height <= BODY_BOTTOM for top, height in boxes)
    assert sum(text.count("Buyer") for _, _, text, _ in observed) == 600
    signature = next(row for row in observed if row[2] == "SIGN HERE")
    line = next(row for row in observed if row[2].startswith("Verkoper(s):"))
    assert signature[0] == line[0]


def test_document_headings_stay_with_identity_rows_and_signature_space(monkeypatch):
    positions = {}
    draw = DocumentPdf.text
    def track(self, x, top, text, **kwargs):
        positions[text] = next(index for index, page in enumerate(self.pages) if page is self.page)
        return draw(self, x, top, text, **kwargs)
    monkeypatch.setattr(DocumentPdf, "text", track)
    pdf = DocumentPdf("Example", None, False, "nl", False)
    pdf.y = BODY_BOTTOM - 70
    pdf.heading("IDENTITY")
    pdf.data_block("Puppy", [("Name", "Nova"), ("Chip", "000000000000001")])
    assert {positions[key] for key in ("IDENTITY", "Puppy", "Name", "Nova", "Chip")} == {1}
    pdf.y = BODY_BOTTOM - 100
    pdf.heading("SIGNING")
    pdf.signature("SIGN HERE")
    assert {positions[key] for key in ("SIGNING", "SIGN HERE", "Verkoper(s):", "Koper(s):")} == {2}
    pdf.new_page()
    pdf.signature("Long signature explanation " * 250 + "SIGN TAIL")
    tail_page = next(page for text, page in positions.items() if text.endswith("SIGN TAIL"))
    assert tail_page == positions["Verkoper(s):"] == positions["Koper(s):"]


@pytest.mark.parametrize("language", ["nl", "en"])
@pytest.mark.parametrize("enabled", [False, True])
def test_document_decoration_options_and_localized_signatures(language, enabled):
    from custom_components.puppy_tracker.pdf_export import _bundled_logo
    template = simple_template(name="LAYOUT TITLE", language=language, logo=enabled, watermark=enabled, initials=enabled)
    pdf = build_document_pdf({"template": template, "values": {}}, _bundled_logo())
    assert (b"/Subtype /Image" in pdf) is enabled
    initials = b"Paraaf verkoper" if language == "nl" else b"Seller initials"
    assert (initials in pdf) is enabled
    assert pdf.count(b"(LAYOUT TITLE)") == (2 if enabled else 1)
    signature_label = b"Naam en handtekening" if language == "nl" else b"Name and signature"
    assert pdf.count(signature_label) == 2


@pytest.mark.parametrize("header_logo", [False, True])
@pytest.mark.parametrize("mode", ["none", "text", "logo"])
def test_watermark_mode_is_independent_of_header_logo_on_every_page(header_logo, mode):
    from custom_components.puppy_tracker.pdf_export import _bundled_logo
    template = simple_template(logo=header_logo, watermark=mode != "none", watermark_type="text" if mode == "none" else mode,
        watermark_text="CONCEPT ONLY", blocks=[{"type": "text", "text": "PAGE ONE"}, {"type": "page_break"}, {"type": "text", "text": "PAGE TWO"}])
    pdf = build_document_pdf({"template": template, "values": {}}, _bundled_logo())
    assert pdf.count(b"/WM gs") == (0 if mode == "none" else 2)
    assert pdf.count(b"(CONCEPT ONLY)") == (2 if mode == "text" else 0)
    assert pdf.count(b"cm /Im1 Do Q") == int(header_logo) + (2 if mode == "logo" else 0)
    assert (b"/Subtype /Image" in pdf) == (header_logo or mode == "logo")
    if mode != "none":
        assert b"/ca 0.075 /CA 0.075" in pdf


async def test_logo_watermark_without_header_logo_survives_preview_and_archive(document_client, setup_documents, storage):
    _, selection = setup_documents
    template = simple_template(logo=False, watermark=True, watermark_type="logo", watermark_text="Retained custom text")
    storage._data["settings"]["document_templates"]["test"] = template
    preview = await request(document_client, "template/preview", template=template)
    assert b"/Im1 Do" in base64.b64decode(preview["result"]["content"])
    saved, _ = await save_document(document_client, selection)
    pdf = base64.b64decode(saved["download"]["content"])
    assert pdf.count(b"cm /Im1 Do Q") == 1  # Watermark only, no header image.
    snapshot_id = storage.get_settings()["documents"]["first"]["snapshot_id"]
    snapshot = json.loads(await storage.files.async_read(snapshot_id))
    assert snapshot["template"]["watermark_type"] == "logo"
    assert snapshot["template"]["watermark_text"] == "Retained custom text"
    storage._data["settings"]["document_templates"]["test"]["watermark_type"] = "text"
    assert (await request(document_client, "download", document_id="first"))["result"] == saved["download"]


async def test_document_api_requires_admin(hass, hass_ws_client, hass_admin_user, setup_documents):
    hass_admin_user.is_admin = False
    client = await hass_ws_client(hass)
    for action, data in (("list", {}), ("download", {"document_id": "x"}), ("template/save", {"template": simple_template()}), ("template/preview", {"template": simple_template()})):
        result = await request(client, action, **data)
        assert not result["success"]
        assert result["error"]["code"] == "unauthorized"
