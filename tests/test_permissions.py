"""Execute the 1.0 permission policy at the real HA entry points."""

from datetime import timedelta
from copy import deepcopy
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from homeassistant.auth.const import GROUP_ID_ADMIN, GROUP_ID_USER, GROUP_ID_READ_ONLY
from homeassistant.components import websocket_api
from homeassistant.components.http.auth import async_sign_path
from homeassistant.core import Context
from homeassistant.exceptions import Unauthorized
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

import custom_components.puppy_tracker as integration
from custom_components.puppy_tracker import api, owner_api, mother_api, mother_dashboard_api
from custom_components.puppy_tracker import care_program_api, recurring_reminder_api, attention_acknowledgement_api
from custom_components.puppy_tracker import onboarding_api
from custom_components.puppy_tracker.backup_http import async_setup_backup_http
from custom_components.puppy_tracker.mother_backup_http import async_setup_mother_backup_http
from custom_components.puppy_tracker.diagnostics import async_get_config_entry_diagnostics
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.owners import OwnerStore, _normalize
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData

PRIVATE = "private-owner-0612345678@example.test"
READ_COMMANDS = {
    "litters", "data", "weight/preview", "records", "upcoming", "subscribe",
    "report/logo", "mother/records", "mother/attention", "care_programs",
    "care_occurrences", "care_program_templates", "recurring_reminders",
    "attention_acknowledgements",
}


def register_api(hass):
    for setup in (api.async_setup_api, owner_api.async_setup_owner_api,
                  mother_api.async_setup_mother_api,
                  mother_dashboard_api.async_setup_mother_dashboard_api,
                  care_program_api.async_setup_care_program_api,
                  recurring_reminder_api.async_setup_recurring_reminder_api,
                  attention_acknowledgement_api.async_setup_attention_acknowledgement_api,
                  onboarding_api.async_setup_onboarding_api):
        setup(hass)


@pytest.fixture
def private_runtime(hass, storage, install_litter):
    install_litter(puppy_overrides={"owner_ids": [PRIVATE]})
    owners = OwnerStore(hass)
    owners._data = {"owners": {PRIVATE: _normalize({
        "name": PRIVATE, "email": PRIVATE, "phone": "0612345678",
        "notes": PRIVATE, "payment_amount": "3210.12",
    }, owner_id=PRIVATE)}}
    runtime = PuppyTrackerRuntimeData(
        storage=storage, owners=owners,
        care_reminders=SimpleNamespace(get_backup_settings=lambda: {
            "lead_days": 7, "categories": {"vaccination": True, "deworming": True},
        }),
        care_programs=SimpleNamespace(get_backup_data=lambda: {"programs": {}}),
        recurring_reminders=SimpleNamespace(get_backup_data=lambda: {"reminders": {}}),
        care_templates=SimpleNamespace(get_backup_data=lambda: {"templates": {}}),
    )
    storage._data["mothers"] = {"mother-1": {"id": "mother-1", "name": "Luna", "records": []}}
    storage._data["litters"]["litter-1"]["mother_id"] = "mother-1"
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = runtime
    entry.add_to_hass(hass)
    return entry, runtime


@pytest.mark.parametrize("user", [None, SimpleNamespace(is_admin=False)], ids=["anonymous", "non-admin"])
def test_all_non_read_websocket_commands_reject_before_accessing_data(hass, user):
    register_api(hass)
    connection = MagicMock()
    connection.user = user
    commands = {name.removeprefix(f"{DOMAIN}/"): handler
                for name, (handler, _schema) in hass.data[websocket_api.DOMAIN].items()
                if name.startswith(f"{DOMAIN}/")}
    assert READ_COMMANDS <= commands.keys()
    protected = commands.keys() - READ_COMMANDS
    assert {"owners/list", "export", "mother/export_url", "care_occurrence/record",
            "attention_acknowledgement/set"} <= protected
    for name in protected:
        with pytest.raises(Unauthorized):
            commands[name](hass, connection, {"id": 1, "type": f"{DOMAIN}/{name}"})
    connection.send_result.assert_not_called()
    connection.send_error.assert_not_called()


@pytest.mark.parametrize("group", [GROUP_ID_USER, GROUP_ID_READ_ONLY])
async def test_authenticated_reader_cannot_get_owners_or_exports(hass, private_runtime, hass_ws_client, group):
    register_api(hass)
    user = await hass.auth.async_create_user("Reader", group_ids=[group])
    refresh = await hass.auth.async_create_refresh_token(user, client_id="https://test.client")
    client = await hass_ws_client(hass, access_token=hass.auth.async_create_access_token(refresh))
    for command in (
        {"type": f"{DOMAIN}/owners/list"},
        {"type": f"{DOMAIN}/owners/payment/add", "owner_id": PRIVATE, "litter_id": "litter-1",
         "expected_revision": "x", "request_id": "r1", "amount": "1.00", "date": "2026-10-26",
         "kind": "other", "method": "cash"},
        {"type": f"{DOMAIN}/owners/payment/void", "owner_id": PRIVATE, "litter_id": "litter-1",
         "payment_id": "r1", "expected_revision": "x", "reason": "error"},
        *({"type": f"{DOMAIN}/export", "litter_id": "litter-1", "format": fmt}
          for fmt in ("csv", "json", "pdf")),
        {"type": f"{DOMAIN}/mother/export_url", "litter_id": "litter-1"},
        {"type": f"{DOMAIN}/care_occurrence/record", "program_id": "program", "puppy_id": "puppy-1", "occurrence_id": "occurrence", "status": "completed"},
        {"type": f"{DOMAIN}/attention_acknowledgement/set", "litter_id": "litter-1", "attention_id": "alert", "acknowledged": True},
    ):
        await client.send_json_auto_id(command)
        response = await client.receive_json()
        assert response["success"] is False
        assert response["error"]["code"] == "unauthorized"
        assert PRIVATE not in json.dumps(response)
    await client.send_json_auto_id({"type": f"{DOMAIN}/data", "litter_id": "litter-1"})
    result = (await client.receive_json())["result"]
    assert result["puppies"][0]["owner_ids"] == []
    assert result["can_manage_records"] is False
    assert PRIVATE not in json.dumps(result)


async def test_admin_websocket_owner_and_report_exports_still_work(hass, private_runtime, hass_ws_client):
    register_api(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": f"{DOMAIN}/owners/list"})
    result = await client.receive_json()
    assert result["success"] is True
    assert result["result"]["owners"][0]["email"] == PRIVATE
    for fmt in ("csv", "json", "pdf"):
        await client.send_json_auto_id({"type": f"{DOMAIN}/export", "litter_id": "litter-1", "format": fmt})
        result = await client.receive_json()
        assert result["success"] is True
        assert result["result"]["content"]
    await client.send_json_auto_id({"type": f"{DOMAIN}/data", "litter_id": "litter-1"})
    assert (await client.receive_json())["result"]["puppies"][0]["owner_ids"] == [PRIVATE]


@pytest.mark.parametrize("path", [
    f"/api/{DOMAIN}/backup/full",
    f"/api/{DOMAIN}/backup/litter/litter-1",
    f"/api/{DOMAIN}/backup/puppy/litter-1/puppy-1",
    f"/api/{DOMAIN}/backup/mother/mother-1?litter_id=litter-1",
])
async def test_backup_http_requires_admin_even_with_a_valid_signed_url(
    hass, private_runtime, hass_client, hass_client_no_auth, path,
):
    assert await async_setup_component(hass, "http", {})
    async_setup_backup_http(hass)
    async_setup_mother_backup_http(hass)
    admin = await hass_client()
    anonymous = await hass_client_no_auth()
    assert (await anonymous.get(path)).status == 401
    content_url = async_sign_path(hass, path, timedelta(minutes=10), refresh_token_id=hass.data["http.auth"])
    assert (await anonymous.get(content_url)).status == 403
    response = await admin.get(path)
    assert response.status == 200
    assert response.headers["Cache-Control"].startswith("no-store")
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    if path.endswith("/full"):
        assert PRIVATE in await response.text()
    for group in (GROUP_ID_USER, GROUP_ID_READ_ONLY):
        user = await hass.auth.async_create_user("Reader", group_ids=[group])
        token = await hass.auth.async_create_refresh_token(user, client_id="https://test.client")
        response = await anonymous.get(path, headers={"Authorization": f"Bearer {hass.auth.async_create_access_token(token)}"})
        assert response.status == 403
        assert PRIVATE not in await response.text()
        signed = async_sign_path(hass, path, timedelta(minutes=10), refresh_token_id=token.id)
        assert (await anonymous.get(signed)).status == 403
    admin_user = await hass.auth.async_create_user("Administrator", group_ids=[GROUP_ID_ADMIN])
    admin_token = await hass.auth.async_create_refresh_token(admin_user, client_id="https://test.client")
    signed = async_sign_path(hass, path, timedelta(minutes=10), refresh_token_id=admin_token.id)
    assert (await anonymous.get(signed)).status == 200
    assert (await anonymous.get(signed + "&changed=1")).status == 401
    expired = async_sign_path(hass, path, timedelta(seconds=-1), refresh_token_id=admin_token.id)
    assert (await anonymous.get(expired)).status == 401
    await hass.auth.async_update_user(admin_user, group_ids=[GROUP_ID_USER])
    assert (await anonymous.get(signed)).status == 403
    await hass.auth.async_update_user(admin_user, group_ids=[GROUP_ID_ADMIN])
    hass.auth.async_remove_refresh_token(admin_token)
    assert (await anonymous.get(signed)).status == 401


async def test_mother_export_url_is_signed_for_the_admin_and_downloadable(
    hass, private_runtime, hass_ws_client, hass_client_no_auth, monkeypatch,
):
    # Use the real production mother storage interface for the context lookup.
    from custom_components.puppy_tracker.mother_storage import MotherScopeStorage
    _entry, runtime = private_runtime
    mother_storage = MotherScopeStorage(hass)
    mother_storage._data = runtime.storage.get_data()
    runtime.storage = mother_storage
    monkeypatch.setattr("custom_components.puppy_tracker.mother_backup_http.get_url", lambda *_args, **_kwargs: "")
    register_api(hass)
    assert await async_setup_component(hass, "http", {})
    async_setup_mother_backup_http(hass)
    client = await hass_ws_client(hass)
    await client.send_json_auto_id({"type": f"{DOMAIN}/mother/export_url", "litter_id": "litter-1", "history_scope": "current"})
    result = await client.receive_json()
    assert result["success"] is True
    anonymous = await hass_client_no_auth()
    url = result["result"]["url"]
    assert "authSig=" in url
    assert (await anonymous.get(url)).status == 200
    assert (await anonymous.get(url.replace("litter-1", "other"))).status == 401


async def test_options_flow_backup_links_keep_the_admin_identity(hass, private_runtime, hass_client_no_auth, monkeypatch):
    from custom_components.puppy_tracker.config_flow import PuppyTrackerOptionsFlow
    assert await async_setup_component(hass, "http", {})
    user = await hass.auth.async_create_user("Administrator", group_ids=[GROUP_ID_ADMIN])
    refresh = await hass.auth.async_create_refresh_token(user, client_id="https://test.client")
    monkeypatch.setattr("custom_components.puppy_tracker.backup_http.get_url", lambda *_args, **_kwargs: "")
    flow = PuppyTrackerOptionsFlow()
    flow.hass = hass
    flow.handler = private_runtime[0].entry_id
    context = websocket_api.current_connection.set(SimpleNamespace(refresh_token_id=refresh.id))
    try:
        result = await flow._show_export_ready(scope="full")
    finally:
        websocket_api.current_connection.reset(context)
    client = await hass_client_no_auth()
    response = await client.get(result["description_placeholders"]["download_url"])
    assert response.status == 200
    assert PRIVATE in await response.text()


async def test_diagnostics_do_not_leak_owner_or_dossier_content(hass, private_runtime, monkeypatch):
    entry, runtime = private_runtime
    runtime.storage._data["litters"]["litter-1"]["puppies"]["puppy-1"]["records"] = [
        {"id": PRIVATE, "type": "invalid", "note": PRIVATE, "data": {"secret": PRIVATE}},
    ]
    runtime.last_backup_error = PRIVATE
    runtime.last_backup_path = PRIVATE
    runtime.storage._data["settings"]["breeder"] = {"name": PRIVATE, "contact": PRIVATE}
    runtime.storage._data["settings"]["notify_entities"] = [PRIVATE]
    integrity = runtime.storage.refresh_integrity_report()
    monkeypatch.setattr(runtime.storage, "refresh_integrity_report", lambda: {**integrity, "future_private_field": PRIVATE})
    result = await async_get_config_entry_diagnostics(hass, entry)
    assert PRIVATE not in json.dumps(result)
    assert "unresolved" not in result["integrity"]
    assert "future_private_field" not in result["integrity"]
    assert "0612345678" not in json.dumps(result)
    assert "3210.12" not in json.dumps(result)
    assert result["integrity"]["unresolved_count"] > 0


@pytest.fixture
async def service_runtime(hass, storage, install_litter, monkeypatch):
    install_litter()
    await hass.auth.async_create_user("Primary administrator", group_ids=[GROUP_ID_ADMIN])
    concrete_storage = integration.MotherScopeIntegrityStorage(hass)
    concrete_storage._data = storage.get_data()
    concrete_storage.async_save = AsyncMock()
    storage = concrete_storage
    storage.async_load = AsyncMock()
    monkeypatch.setattr(integration, "MotherScopeIntegrityStorage", lambda _hass: storage)
    for cls in (integration.CareReminderStore, integration.AgeBasedCareProgramStore,
                integration.RecurringReminderStore, integration.CareProgramTemplateStore,
                integration.AttentionAcknowledgementStore, integration.OwnerStore):
        monkeypatch.setattr(cls, "async_load", AsyncMock())
    monkeypatch.setattr(integration, "async_setup_frontend", AsyncMock())
    monkeypatch.setattr(integration, "async_setup_managed_files_http", MagicMock())
    monkeypatch.setattr(integration, "async_sync_devices", MagicMock())
    monkeypatch.setattr(integration.PuppyNotificationManager, "async_start", AsyncMock())
    monkeypatch.setattr(integration.RecurringReminderNotificationManager, "async_start", AsyncMock())
    monkeypatch.setattr(hass.config_entries, "async_forward_entry_setups", AsyncMock())
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await integration.async_setup_entry(hass, entry)
    return entry.runtime_data


@pytest.mark.parametrize("service,data", [
    ("create_litter", {"name": "New litter"}),
    ("add_puppy", {"litter_id": "litter-1", "name": "New puppy"}),
    ("record_weight", {"litter_id": "litter-1", "puppy_id": "puppy-1", "weight": 600}),
    ("backup_to_file", {"path": "backups/test.json", "scope": "litter", "litter_id": "litter-1"}),
])
@pytest.mark.parametrize("group", [GROUP_ID_USER, GROUP_ID_READ_ONLY])
async def test_services_reject_non_admin_before_side_effects(hass, service_runtime, service, data, group):
    user = await hass.auth.async_create_user("Reader", group_ids=[group])
    assert not user.is_admin
    before = service_runtime.storage.get_data()
    with pytest.raises(Unauthorized):
        await hass.services.async_call(DOMAIN, service, data, blocking=True, context=Context(user_id=user.id))
    assert service_runtime.storage.get_data() == before
    assert service_runtime.last_backup_status == "unknown"


@pytest.mark.parametrize("admin", [True, False], ids=["admin", "automation"])
async def test_file_backup_still_works_for_admin_and_automation(hass, service_runtime, tmp_path, admin):
    hass.config.config_dir = str(tmp_path)
    user = await hass.auth.async_create_user("Administrator", group_ids=[GROUP_ID_ADMIN]) if admin else None
    await hass.services.async_call(DOMAIN, "backup_to_file", {
        "path": "backups/test.json", "scope": "litter", "litter_id": "litter-1",
    }, blocking=True, context=Context(user_id=user.id if user else None))
    assert (tmp_path / "backups/test.json").is_file()
    assert service_runtime.last_backup_status == "ok"
    assert (await service_runtime.onboarding.async_status(service_runtime.storage, "admin"))["steps"]["backup"] is True


async def test_weight_automation_works_while_station_waits_for_recovery(hass, service_runtime):
    from custom_components.puppy_tracker.session import start_weighing_session, recover_session

    runtime = service_runtime
    start_weighing_session(runtime, "litter-1", ["puppy-1"])
    runtime.storage._data["weighing_session"] = deepcopy(runtime.weighing_session)
    runtime.weighing_session = recover_session(runtime.storage)
    runtime.weight_input = 999
    checkpoint = deepcopy(runtime.weighing_session)
    await hass.services.async_call(DOMAIN, "record_weight", {
        "litter_id": "litter-1", "puppy_id": "puppy-1", "weight": 600,
    }, blocking=True)
    assert runtime.storage.get_active_measurements("litter-1", "puppy-1")[-1]["weight"] == 600
    assert runtime.weighing_session == checkpoint
    assert runtime.weight_input == 999


@pytest.mark.parametrize("path", ["www/private.json", "../escape.json", "linked/private.json"])
async def test_file_backups_cannot_escape_config_or_use_public_storage(hass, service_runtime, tmp_path, path):
    hass.config.config_dir = str(tmp_path)
    (tmp_path / "www").mkdir()
    (tmp_path / "linked").symlink_to(tmp_path / "www", target_is_directory=True)
    with pytest.raises(ValueError):
        await hass.services.async_call(DOMAIN, "backup_to_file", {
            "path": path, "scope": "litter", "litter_id": "litter-1",
        }, blocking=True)
    assert list((tmp_path / "www").iterdir()) == []
    assert service_runtime.last_backup_error == "backup_failed"
    assert service_runtime.onboarding._data["backups"] == {}


async def test_file_backup_rejects_the_real_target_of_a_public_www_symlink(hass, service_runtime, tmp_path):
    hass.config.config_dir = str(tmp_path)
    public = tmp_path / "shared"
    public.mkdir()
    (tmp_path / "www").symlink_to(public, target_is_directory=True)
    with pytest.raises(ValueError, match="public www"):
        await hass.services.async_call(DOMAIN, "backup_to_file", {
            "path": "shared/private.json", "scope": "litter", "litter_id": "litter-1",
        }, blocking=True)
    assert list(public.iterdir()) == []
