"""Executable handoff state, concurrency, backup and PDF regressions."""
from copy import deepcopy
from datetime import timedelta
from unittest.mock import AsyncMock
import base64
import json
import asyncio

import pytest
from homeassistant.util import dt as dt_util

from custom_components.puppy_tracker.handoff import (
    CHECKS, HandoffConflict, handoff_summary, normalize_handoff, checklist_for_litter, normalize_checklist_items,
)
from custom_components.puppy_tracker.api import _litter_payload
from custom_components.puppy_tracker.backup import build_export_document, parse_export_json, BackupValidationError, prepare_import, async_apply_import
from custom_components.puppy_tracker.pdf_export import build_pdf_export


def value(*, complete=False, departure=None):
    return {"stage": "reserved", "departure_date": departure,
            "checks": {key: complete for key in CHECKS}}


@pytest.mark.parametrize("bad", [[], {"stage": "sold"}, {"status": "assigned"},
    {"checks": {"unknown": True}}, {"checks": {"chip": "false"}},
    {"departure_date": "20261101"}, {"departure_date": "2026-02-30"}])
def test_rejects_ambiguous_or_invalid_portable_state(bad):
    with pytest.raises(ValueError):
        normalize_handoff(bad, items=checklist_for_litter({})["items"])


async def test_assignment_is_derived_and_checklist_never_auto_completed(storage, install_litter):
    litter, puppy = install_litter()
    original = deepcopy(storage.get_data())
    summary = handoff_summary(storage.get_puppy(litter, puppy), storage.get_litter(litter))
    assert summary["status"] == "available" and summary["missing"] == list(CHECKS)
    assert storage.get_data() == original  # Reading old puppies does not migrate/write them.
    await storage.async_save_handoff(litter, puppy, value(), expected_checklist_revision="default", expected_updated_at=storage.get_puppy(litter, puppy)["updated_at"])
    await storage.async_set_puppy_owner_ids(litter, puppy, ["owner-a"])
    assert handoff_summary(storage.get_puppy(litter, puppy), storage.get_litter(litter))["status"] == "assigned"
    await storage.async_set_puppy_owner_ids(litter, puppy, ["owner-b"])
    assert handoff_summary(storage.get_puppy(litter, puppy), storage.get_litter(litter))["completed_count"] == 0
    await storage.async_set_puppy_owner_ids(litter, puppy, [])
    assert handoff_summary(storage.get_puppy(litter, puppy), storage.get_litter(litter))["status"] == "reserved"
    # Data/reader payloads never contain private contact IDs through the handoff view.
    await storage.async_set_puppy_owner_ids(litter, puppy, ["private-owner-id"])
    payload = _litter_payload(storage, litter)["puppies"][0]
    assert payload["owner_ids"] == []
    assert "private-owner-id" not in str(payload["handoff"])


async def test_departure_requires_confirmation_and_is_one_authoritative_timeline_fact(storage, install_litter):
    litter, puppy = install_litter()
    revision = storage.get_puppy(litter, puppy)["updated_at"]
    today = dt_util.now().date().isoformat()
    with pytest.raises(ValueError, match="incomplete"):
        await storage.async_save_handoff(litter, puppy, value(departure=today), expected_checklist_revision="default", expected_updated_at=revision)
    await storage.async_save_handoff(litter, puppy, value(departure=today), expected_checklist_revision="default", expected_updated_at=revision, confirm_incomplete=True)
    stored = storage.get_puppy(litter, puppy)
    assert stored["records"] == []  # No duplicate stored milestone to drift out of sync.
    milestone = storage.get_records(litter, puppy)[0]
    assert milestone["generated"] == "handoff_departure"
    assert dt_util.as_local(dt_util.parse_datetime(milestone["occurred_at"])).date().isoformat() == today
    await storage.async_save_handoff(litter, puppy, value(complete=True, departure=today), expected_checklist_revision="default", expected_updated_at=stored["updated_at"])
    assert len(storage.get_records(litter, puppy)) == 1
    stored = storage.get_puppy(litter, puppy)
    assert handoff_summary(stored, storage.get_litter(litter))["ready"] is True
    await storage.async_save_handoff(litter, puppy, value(complete=True), expected_checklist_revision="default", expected_updated_at=stored["updated_at"])
    assert storage.get_records(litter, puppy) == []
    assert len([entry for entry in storage.get_data()["audit_log"] if entry["action"] == "update_puppy_handoff"]) == 3


async def test_stale_link_changes_and_failed_or_cancelled_writes_do_not_lose_data(storage, install_litter):
    litter, puppy = install_litter()
    revision = storage.get_puppy(litter, puppy)["updated_at"]
    await storage.async_set_puppy_owner_ids(litter, puppy, ["new-owner"])
    with pytest.raises(HandoffConflict):
        await storage.async_save_handoff(litter, puppy, value(), expected_checklist_revision="default", expected_updated_at=revision)
    for failure in (OSError("disk full"), asyncio.CancelledError()):
        before = deepcopy(storage.get_data())
        storage.async_save = AsyncMock(side_effect=failure)
        with pytest.raises(type(failure)):
            await storage.async_save_handoff(litter, puppy, value(), expected_checklist_revision="default", expected_updated_at=storage.get_puppy(litter, puppy)["updated_at"])
        assert storage.get_data() == before


async def test_future_and_pre_birth_departures_are_rejected(storage, install_litter):
    litter, puppy = install_litter()
    for day in ((dt_util.now().date() + timedelta(days=1)).isoformat(), "2020-01-01"):
        with pytest.raises(ValueError, match="between birth and today"):
            await storage.async_save_handoff(litter, puppy, value(complete=True, departure=day), expected_checklist_revision="default", expected_updated_at=storage.get_puppy(litter, puppy)["updated_at"])


@pytest.mark.parametrize("scope", ["litter", "puppy"])
def test_portable_backups_keep_and_validate_handoff(storage, install_litter, scope):
    litter, puppy = install_litter(puppy_overrides={"handoff": value(complete=True, departure="2026-10-01")})
    document = build_export_document(storage, scope=scope, litter_id=litter, puppy_id=puppy)
    restored = parse_export_json(json.dumps(document))
    exported = restored["puppy"] if scope == "puppy" else restored["litter"]["puppies"][puppy]
    assert exported["handoff"] == value(complete=True, departure="2026-10-01")
    exported["handoff"]["checks"]["chip"] = "yes"
    with pytest.raises(BackupValidationError):
        parse_export_json(json.dumps(restored))


@pytest.mark.parametrize("language", ["nl", "en"])
def test_pdf_handoff_is_independent_private_and_scoped(storage, install_litter, language):
    litter, puppy = install_litter(puppy_overrides={"name": "Selected puppy", "owner_ids": ["private-owner"], "handoff": value(departure="2026-10-01")})
    storage.get_litter(litter)["puppies"]["other"] = {"id": "other", "name": "Other puppy marker", "handoff": value()}
    from tests.test_pdf_export_options import _sections
    sections = _sections("handoff")
    pdf = base64.b64decode(build_pdf_export(storage, litter, puppy_id=puppy, sections=sections, language=language,
        owner_records=[{"id": "private-owner", "name": "Private buyer marker", "email": "private@example.test"}])[2])
    heading = b"Overdracht" if language == "nl" else b"Handover"
    assert heading in pdf and b"Selected puppy" in pdf
    assert b"Other puppy marker" not in pdf and b"Private buyer marker" not in pdf and b"private@example.test" not in pdf
    assert (b"Vertrokken" if language == "nl" else b"Departed") in pdf
    assert (b"Nog te controleren" if language == "nl" else b"Still to check") in pdf
    assert heading not in base64.b64decode(build_pdf_export(storage, litter, puppy_id=puppy, sections=_sections(), language=language)[2])


@pytest.mark.parametrize("scope,mode", [("full", "replace_all"), ("puppy", "new_litter")])
async def test_handoff_survives_actual_restore_and_id_remapping(storage, install_litter, make_measurement, scope, mode):
    from tests.test_backup_restore import CARE_SETTINGS, EMPTY_SCHEDULERS
    litter, puppy = install_litter(
        measurements=[make_measurement("birth", 400, "2026-08-28T10:00:00+00:00", kind="birth")],
        puppy_overrides={"birth_measurement_id": "birth", "handoff": value(complete=True, departure="2026-10-01")})
    document = build_export_document(storage, scope=scope, litter_id=litter, puppy_id=puppy,
        care_reminder_settings=CARE_SETTINGS, scheduler_data=EMPTY_SCHEDULERS if scope == "full" else None)
    parsed = parse_export_json(json.dumps(document))
    plan = prepare_import(storage, parsed, mode=mode)
    await async_apply_import(storage, plan)
    found = [p for item in storage.get_data()["litters"].values() for p in item["puppies"].values() if p.get("handoff")]
    assert found and all(p["handoff"] == value(complete=True, departure="2026-10-01") for p in found)
    if scope == "puppy":
        assert any(p["id"] != puppy for p in found)


@pytest.mark.parametrize("items", [[], [{"id": "x", "label": ""}], [{"id": "x", "label": None}],
    [{"id": "a", "label": "A"}, {"id": "a", "label": "B"}], [{"id": "../x", "label": "X"}],
    [{"id": "x", "label": "hello\nworld"}], [{"id": str(i), "label": "X"} for i in range(41)]])
def test_custom_checklist_validation(items):
    with pytest.raises(ValueError):
        normalize_checklist_items(items)


async def test_template_edits_reconcile_all_puppies_without_changing_other_nests(storage, install_litter):
    litter, puppy = install_litter(puppy_overrides={"handoff": value(complete=True, departure="2026-10-01")})
    install_litter(litter_id="other-litter", puppy_id="other-puppy")
    other_before = deepcopy(storage.get_litter("other-litter"))
    second = deepcopy(storage.get_puppy(litter, puppy))
    second.update(id="second", active=False)
    storage._data["litters"][litter]["puppies"]["second"] = second
    items = [{"id": "registration", "label": None}, {"id": "chip", "label": "New chip confirmation"}, {"id": "custom", "label": "Puppy bag packed"}]
    saved = await storage.async_save_handoff_checklist(litter, items, expected_revision="default")
    assert saved["revision"] != "default" and saved["items"] == items
    for puppy_id in (puppy, "second"):
        state = storage.get_puppy(litter, puppy_id)["handoff"]
        assert state["checks"] == {"registration": True, "chip": False, "custom": False}
        assert state["departure_date"] == "2026-10-01"  # A historical departure is never erased by template edits.
        summary = handoff_summary(storage.get_puppy(litter, puppy_id), storage.get_litter(litter))
        assert summary["total_count"] == 3 and summary["completed_count"] == 1
    assert storage.get_litter("other-litter") == other_before
    assert items[0] == {"id": "registration", "label": None}  # No mutation of the caller's definition.
    reordered = await storage.async_save_handoff_checklist(litter, items[::-1], expected_revision=saved["revision"])
    assert storage.get_puppy(litter, puppy)["handoff"]["checks"]["registration"] is True
    with pytest.raises(HandoffConflict):
        await storage.async_save_handoff_checklist(litter, items, expected_revision=saved["revision"])
    assert reordered["revision"] != saved["revision"]


async def test_template_revision_guards_unstarted_puppy_forms_and_template_write_rolls_back(storage, install_litter):
    litter, puppy = install_litter()
    revision = storage.get_puppy(litter, puppy)["updated_at"]
    items = [{"id": "custom", "label": "Food packed"}]
    saved = await storage.async_save_handoff_checklist(litter, items, expected_revision="default")
    assert storage.get_puppy(litter, puppy)["updated_at"] == revision
    with pytest.raises(HandoffConflict):
        await storage.async_save_handoff(litter, puppy, {"checks": {"custom": True}}, expected_updated_at=revision, expected_checklist_revision="default")
    await storage.async_save_handoff(litter, puppy, {"checks": {"custom": True}}, expected_updated_at=revision, expected_checklist_revision=saved["revision"])
    for failure in (OSError("disk full"), asyncio.CancelledError()):
        before = deepcopy(storage.get_data())
        storage.async_save = AsyncMock(side_effect=failure)
        with pytest.raises(type(failure)):
            await storage.async_save_handoff_checklist(litter, [{"id": "custom", "label": "Changed"}], expected_revision=saved["revision"])
        assert storage.get_data() == before


@pytest.mark.parametrize("scope", ["full", "litter", "puppy"])
async def test_custom_template_and_confirmations_survive_restore_and_labels_reach_pdf(storage, install_litter, make_measurement, scope):
    from tests.test_backup_restore import CARE_SETTINGS, EMPTY_SCHEDULERS
    from tests.test_pdf_export_options import _sections
    litter, puppy = install_litter(measurements=[make_measurement("birth", 400, "2026-08-28T10:00:00+00:00", kind="birth")], puppy_overrides={"birth_measurement_id": "birth"})
    template = await storage.async_save_handoff_checklist(litter, [{"id": "custom-bag", "label": "Puppy bag packed"}], expected_revision="default")
    await storage.async_save_handoff(litter, puppy, {"checks": {"custom-bag": True}}, expected_updated_at=storage.get_puppy(litter, puppy)["updated_at"], expected_checklist_revision=template["revision"])
    document = build_export_document(storage, scope=scope, litter_id=litter, puppy_id=puppy,
        care_reminder_settings=CARE_SETTINGS, scheduler_data=EMPTY_SCHEDULERS if scope == "full" else None)
    parsed = parse_export_json(json.dumps(document))
    mode = "replace_all" if scope == "full" else "new_litter"
    plan = prepare_import(storage, parsed, mode=mode)
    await async_apply_import(storage, plan)
    restored = [l for l in storage.get_data()["litters"].values() if l.get("handoff_checklist")]
    assert restored and all(l["handoff_checklist"]["items"] == template["items"] for l in restored)
    for language in ("nl", "en"):
        pdf = base64.b64decode(build_pdf_export(storage, restored[-1]["id"], sections=_sections("handoff"), language=language)[2])
        assert b"Puppy bag packed" in pdf and b"custom-bag" not in pdf
    # A mismatched target must never silently discard confirmations or replace its template.
    other, _ = install_litter(litter_id="different", puppy_id="different-puppy")
    if scope != "full":
        before = deepcopy(storage.get_data())
        with pytest.raises(BackupValidationError, match="checklists differ"):
            prepare_import(storage, parsed, mode="existing_litter", target_litter_id=other)
        assert storage.get_data() == before
    invalid = deepcopy(document)
    source = invalid["data"]["litters"][litter] if scope == "full" else invalid["litter"] if scope == "litter" else invalid["source_litter"]
    source["handoff_checklist"]["items"][0]["label"] = ""
    with pytest.raises(BackupValidationError):
        parse_export_json(json.dumps(invalid))


@pytest.mark.parametrize("scope", ["litter", "puppy"])
async def test_checklist_ids_and_labels_are_not_dog_references_during_transfer(storage, install_litter, make_measurement, scope):
    litter, puppy = install_litter(measurements=[make_measurement("birth", 400, "2026-08-28T10:00:00+00:00", kind="birth")], puppy_overrides={"birth_measurement_id": "birth"})
    template = await storage.async_save_handoff_checklist(litter, [{"id": puppy, "label": puppy}], expected_revision="default")
    await storage.async_save_handoff(litter, puppy, {"checks": {puppy: True}}, expected_updated_at=storage.get_puppy(litter, puppy)["updated_at"], expected_checklist_revision=template["revision"])
    document = parse_export_json(json.dumps(build_export_document(storage, scope=scope, litter_id=litter, puppy_id=puppy)))
    plan = prepare_import(storage, document, mode="new_litter")
    await async_apply_import(storage, plan)
    imported = [l for l in storage.get_data()["litters"].values() if l["id"] != litter][-1]
    new_puppy = next(iter(imported["puppies"].values()))
    assert new_puppy["id"] != puppy
    assert imported["handoff_checklist"]["items"] == [{"id": puppy, "label": puppy}]
    assert new_puppy["handoff"]["checks"] == {puppy: True}
