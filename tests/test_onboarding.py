"""Execute checklist state, persistence, backup evidence and HA permissions."""

from copy import deepcopy
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from homeassistant.auth.const import GROUP_ID_USER
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.backup_http import async_backup_export
from custom_components.puppy_tracker.api import async_setup_api
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.onboarding import OnboardingStore
from custom_components.puppy_tracker.onboarding_api import async_setup_onboarding_api
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData


@pytest.fixture
def guidance(hass):
    store = OnboardingStore(hass)
    store._store.async_save = AsyncMock()
    return store


def runtime_for(storage, guidance):
    return PuppyTrackerRuntimeData(
        storage=storage, onboarding=guidance,
        care_reminders=SimpleNamespace(get_backup_settings=lambda: {"lead_days": 7, "categories": {"vaccination": True, "deworming": True}}),
        care_programs=SimpleNamespace(get_backup_data=lambda: {"programs": {}}),
        recurring_reminders=SimpleNamespace(get_backup_data=lambda: {"reminders": {}}),
        care_templates=SimpleNamespace(get_backup_data=lambda: {"templates": {}}),
    )


async def test_new_install_keeps_guidance_until_actual_setup_is_complete(storage, guidance, install_litter, make_measurement):
    status = await guidance.async_status(storage, "admin")
    assert status["visible"] is True
    assert not any(status["steps"].values())
    litter_id, puppy_id = install_litter(measurements=[make_measurement("birth", 400, "2026-10-01T12:00:00Z", kind="birth")])
    status = await guidance.async_status(storage, "admin")
    assert status["visible"] is True
    assert status["steps"] == {"litter": True, "mother": True, "puppies": True, "weighing": False, "backup": False}
    storage._data["litters"][litter_id]["puppies"][puppy_id]["measurements"].append(make_measurement("weigh", 420, "2026-10-02T12:00:00Z"))
    await guidance.async_record_backup([litter_id])
    status = await guidance.async_status(storage, "admin")
    assert status["complete"] is True
    assert status["visible"] is False
    await guidance.async_set_visible("admin", True)
    assert (await guidance.async_status(storage, "admin"))["visible"] is True


async def test_existing_litters_are_opt_in_and_preferences_are_per_user(storage, guidance, install_litter):
    install_litter()
    assert (await guidance.async_status(storage, "alice"))["visible"] is False
    await guidance.async_set_visible("alice", True)
    assert (await guidance.async_status(storage, "alice"))["visible"] is True
    assert (await guidance.async_status(storage, "bob"))["visible"] is False
    saved = deepcopy(guidance._data)
    guidance._store.async_load = AsyncMock(return_value=saved)
    await guidance.async_load()
    assert (await guidance.async_status(storage, "alice"))["visible"] is True
    with pytest.raises(ValueError, match="Unknown litter"):
        await guidance.async_status(storage, "alice", "missing")


async def test_failed_preference_write_retains_previous_state(guidance):
    await guidance.async_set_visible("alice", True)
    before = deepcopy(guidance._data)
    guidance._store.async_save.side_effect = OSError("Full disk")
    with pytest.raises(OSError):
        await guidance.async_set_visible("alice", False)
    assert guidance._data == before


@pytest.mark.parametrize("scope,covered", [("full", ["one", "two"]), ("litter", ["one"]), ("puppy", [])])
async def test_only_generated_full_or_litter_backups_count(storage, guidance, install_litter, scope, covered):
    install_litter(litter_id="one")
    install_litter(litter_id="two")
    runtime = runtime_for(storage, guidance)
    exported = await async_backup_export(runtime, scope=scope, litter_id="one", puppy_id="puppy-1")
    assert json.loads(exported["content"])["export_version"]
    assert sorted(guidance._data["backups"]) == covered
    before = deepcopy(guidance._data)
    with pytest.raises(ValueError):
        await async_backup_export(runtime, scope="litter", litter_id="missing")
    assert guidance._data == before


async def test_backup_progress_failure_does_not_fail_the_export(storage, guidance, install_litter):
    install_litter()
    guidance._store.async_save.side_effect = OSError("Full disk")
    exported = await async_backup_export(runtime_for(storage, guidance), scope="full")
    assert exported["content"]
    assert guidance._data["backups"] == {}


async def test_deleted_and_corrected_measurements_do_not_complete_weighing(storage, guidance, install_litter, make_measurement):
    install_litter(measurements=[make_measurement("deleted", 410, "2026-10-01T12:00:00Z", deleted=True), make_measurement("old", 420, "2026-10-02T12:00:00Z", superseded_by="new")])
    assert (await guidance.async_status(storage, "admin"))["steps"]["weighing"] is False


async def test_admin_can_reopen_and_export_via_websocket(hass, storage, guidance, hass_ws_client):
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = runtime_for(storage, guidance)
    entry.add_to_hass(hass)
    async_setup_onboarding_api(hass)
    async_setup_onboarding_api(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": f"{DOMAIN}/onboarding"})
    assert (await client.receive_json())["result"]["visible"] is True
    await client.send_json_auto_id({"type": f"{DOMAIN}/onboarding", "visible": False})
    assert (await client.receive_json())["result"]["visible"] is False
    await client.send_json_auto_id({"type": f"{DOMAIN}/onboarding/backup"})
    assert json.loads((await client.receive_json())["result"]["content"])["export_version"]
    await client.send_json_auto_id({"type": f"{DOMAIN}/onboarding", "user_id": "somebody-else"})
    assert (await client.receive_json())["success"] is False


async def test_non_admin_cannot_read_change_or_export_guidance(hass, hass_ws_client):
    async_setup_onboarding_api(hass)
    user = await hass.auth.async_create_user("Reader", group_ids=[GROUP_ID_USER])
    refresh = await hass.auth.async_create_refresh_token(user, client_id="https://test.client")
    client = await hass_ws_client(hass, access_token=hass.auth.async_create_access_token(refresh))
    for command in ({"type": f"{DOMAIN}/onboarding"}, {"type": f"{DOMAIN}/onboarding", "visible": True}, {"type": f"{DOMAIN}/onboarding/backup"}):
        await client.send_json_auto_id(command)
        response = await client.receive_json()
        assert response["error"]["code"] == "unauthorized"


async def test_report_json_export_also_records_backup_evidence(hass, storage, guidance, install_litter, hass_ws_client):
    litter_id, _ = install_litter()
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = runtime_for(storage, guidance)
    entry.add_to_hass(hass)
    async_setup_api(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": f"{DOMAIN}/export", "litter_id": litter_id, "format": "json"})
    assert (await client.receive_json())["success"] is True
    await hass.async_block_till_done()
    assert (await guidance.async_status(storage, "admin"))["steps"]["backup"] is True
