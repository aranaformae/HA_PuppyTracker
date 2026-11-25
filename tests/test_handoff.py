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
    CHECKS, HandoffConflict, handoff_summary, normalize_handoff,
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
        normalize_handoff(bad)


async def test_assignment_is_derived_and_checklist_never_auto_completed(storage, install_litter):
    litter, puppy = install_litter()
    original = deepcopy(storage.get_data())
    summary = handoff_summary(storage.get_puppy(litter, puppy))
    assert summary["status"] == "available" and summary["missing"] == list(CHECKS)
    assert storage.get_data() == original  # Reading old puppies does not migrate/write them.
    await storage.async_save_handoff(litter, puppy, value(), expected_updated_at=storage.get_puppy(litter, puppy)["updated_at"])
    await storage.async_set_puppy_owner_ids(litter, puppy, ["owner-a"])
    assert handoff_summary(storage.get_puppy(litter, puppy))["status"] == "assigned"
    await storage.async_set_puppy_owner_ids(litter, puppy, ["owner-b"])
    assert handoff_summary(storage.get_puppy(litter, puppy))["completed_count"] == 0
    await storage.async_set_puppy_owner_ids(litter, puppy, [])
    assert handoff_summary(storage.get_puppy(litter, puppy))["status"] == "reserved"
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
        await storage.async_save_handoff(litter, puppy, value(departure=today), expected_updated_at=revision)
    await storage.async_save_handoff(litter, puppy, value(departure=today), expected_updated_at=revision, confirm_incomplete=True)
    stored = storage.get_puppy(litter, puppy)
    assert stored["records"] == []  # No duplicate stored milestone to drift out of sync.
    milestone = storage.get_records(litter, puppy)[0]
    assert milestone["generated"] == "handoff_departure"
    assert dt_util.as_local(dt_util.parse_datetime(milestone["occurred_at"])).date().isoformat() == today
    await storage.async_save_handoff(litter, puppy, value(complete=True, departure=today), expected_updated_at=stored["updated_at"])
    assert len(storage.get_records(litter, puppy)) == 1
    stored = storage.get_puppy(litter, puppy)
    assert handoff_summary(stored)["ready"] is True
    await storage.async_save_handoff(litter, puppy, value(complete=True), expected_updated_at=stored["updated_at"])
    assert storage.get_records(litter, puppy) == []
    assert len([entry for entry in storage.get_data()["audit_log"] if entry["action"] == "update_puppy_handoff"]) == 3


async def test_stale_link_changes_and_failed_or_cancelled_writes_do_not_lose_data(storage, install_litter):
    litter, puppy = install_litter()
    revision = storage.get_puppy(litter, puppy)["updated_at"]
    await storage.async_set_puppy_owner_ids(litter, puppy, ["new-owner"])
    with pytest.raises(HandoffConflict):
        await storage.async_save_handoff(litter, puppy, value(), expected_updated_at=revision)
    for failure in (OSError("disk full"), asyncio.CancelledError()):
        before = deepcopy(storage.get_data())
        storage.async_save = AsyncMock(side_effect=failure)
        with pytest.raises(type(failure)):
            await storage.async_save_handoff(litter, puppy, value(), expected_updated_at=storage.get_puppy(litter, puppy)["updated_at"])
        assert storage.get_data() == before


async def test_future_and_pre_birth_departures_are_rejected(storage, install_litter):
    litter, puppy = install_litter()
    for day in ((dt_util.now().date() + timedelta(days=1)).isoformat(), "2020-01-01"):
        with pytest.raises(ValueError, match="between birth and today"):
            await storage.async_save_handoff(litter, puppy, value(complete=True, departure=day), expected_updated_at=storage.get_puppy(litter, puppy)["updated_at"])


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
