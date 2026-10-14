"""Central breeder editing, persistence and authoritative report coverage."""

import base64
from copy import deepcopy
from unittest.mock import AsyncMock, MagicMock

import pytest
import voluptuous as vol
from homeassistant.data_entry_flow import FlowResultType
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.api import websocket_export_data, websocket_report_logo
from custom_components.puppy_tracker.backup import BackupValidationError, async_apply_import, build_export_document, prepare_import
from custom_components.puppy_tracker.breeder import normalize_breeder
from custom_components.puppy_tracker.config_flow import PuppyTrackerOptionsFlow
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData

BREEDER = {"name": "Milky Way", "contact": "private@example.com", "logo_url": "/local/logo.png"}


def attach_storage(hass, storage):
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = PuppyTrackerRuntimeData(storage=storage)
    entry.add_to_hass(hass)
    return entry


async def test_form_saves_and_clears_central_breeder(hass, storage):
    entry = attach_storage(hass, storage)
    flow = PuppyTrackerOptionsFlow()
    flow.hass = hass
    flow.handler = entry.entry_id
    assert "breeder" in (await flow.async_step_init())["menu_options"]
    before = storage.get_settings()
    form = await flow.async_step_breeder()
    storage.async_save.assert_not_awaited()
    result = await flow.async_step_breeder(form["data_schema"](BREEDER))
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert storage.get_breeder() == BREEDER
    assert {key: value for key, value in storage.get_settings().items() if key != "breeder"} == {key: value for key, value in before.items() if key != "breeder"}
    form = await flow.async_step_breeder()
    assert {marker.schema: marker.description["suggested_value"] for marker in form["data_schema"].schema if marker.schema in BREEDER} == BREEDER
    result = await flow.async_step_breeder({})
    assert result["type"] is FlowResultType.CREATE_ENTRY
    assert storage.get_breeder() == normalize_breeder()


async def test_invalid_input_and_failed_save_do_not_change_settings(hass, storage):
    await storage.async_update_breeder(BREEDER)
    before = storage.get_data()
    entry = attach_storage(hass, storage)
    flow = PuppyTrackerOptionsFlow()
    flow.hass = hass
    flow.handler = entry.entry_id
    result = await flow.async_step_breeder({**BREEDER, "logo_url": "https://external.example/logo.png"})
    assert result["errors"] == {"base": "invalid_breeder"}
    assert storage.get_data() == before
    storage.async_save = AsyncMock(side_effect=OSError("save failed"))
    result = await flow.async_step_breeder({**BREEDER, "name": "Changed"})
    assert result["errors"] == {"base": "unknown"}
    assert storage.get_data() == before


async def test_monitoring_updates_keep_breeder(storage):
    await storage.async_update_breeder(BREEDER)
    values = {key: value for key, value in storage.get_settings().items() if key != "breeder"}
    await storage.async_update_settings(**values)
    assert storage.get_breeder() == BREEDER


async def test_pdf_uses_central_identity_and_filters_contact(hass, storage, install_litter):
    litter_id, puppy_id = install_litter()
    attach_storage(hass, storage)
    await storage.async_update_breeder(BREEDER)
    connection = MagicMock()
    websocket_report_logo(hass, connection, {"id": 1})
    assert connection.send_result.call_args.args[1] == {"logo_url": BREEDER["logo_url"]}
    for show_name, show_contact in ((False, False), (True, False), (False, True), (True, True)):
        message = websocket_export_data._ws_schema({"id": 2, "type": "puppy_tracker/export", "format": "pdf", "litter_id": litter_id, "puppy_id": puppy_id, "sections": {"breeder_name": show_name, "breeder_contact": show_contact}})
        websocket_export_data(hass, connection, message)
        document = base64.b64decode(connection.send_result.call_args.args[1]["content"])
        assert (b"Milky Way" in document) is show_name
        assert (b"private@example.com" in document) is show_contact
    # The public export schema no longer accepts per-card breeder overrides.
    with pytest.raises(vol.Invalid):
        websocket_export_data._ws_schema({"id": 3, "type": "puppy_tracker/export", "format": "pdf", "litter_id": litter_id, "branding": {"name": "Card override"}})


async def test_full_backup_restores_identity_and_partial_import_keeps_it(storage, install_litter):
    litter_id, _ = install_litter()
    await storage.async_update_breeder(BREEDER)
    document = build_export_document(storage, scope="full", care_reminder_settings={"lead_days": 5, "categories": {"vaccination": True, "deworming": True}}, scheduler_data={"version": 1, "care_programs": {"programs": {}}, "recurring_reminders": {"reminders": {}}})
    assert document["data"]["settings"]["breeder"] == BREEDER
    invalid = deepcopy(document)
    invalid["data"]["settings"]["breeder"]["logo_url"] = "https://external.example/logo.png"
    with pytest.raises(BackupValidationError):
        prepare_import(storage, invalid, mode="replace_all")
    assert storage.get_breeder() == BREEDER
    await storage.async_update_breeder({"name": "Other"})
    await async_apply_import(storage, prepare_import(storage, document, mode="replace_all"))
    assert storage.get_breeder() == BREEDER
    old_document = deepcopy(document)
    del old_document["data"]["settings"]["breeder"]
    await async_apply_import(storage, prepare_import(storage, old_document, mode="replace_all"))
    assert storage.get_breeder() == normalize_breeder()
    await storage.async_update_breeder(BREEDER)
    partial = build_export_document(storage, scope="litter", litter_id=litter_id)
    await async_apply_import(storage, prepare_import(storage, partial, mode="new_litter"))
    assert storage.get_breeder() == BREEDER
