"""Private logo storage, native options upload and portable file backup coverage."""

import base64
from contextlib import contextmanager
from copy import deepcopy
from hashlib import sha256
from io import BytesIO
import json
from unittest.mock import AsyncMock, MagicMock, patch
from types import SimpleNamespace

from aiohttp import web
from PIL import Image
import pytest
from homeassistant.setup import async_setup_component
from pytest_homeassistant_custom_component.common import MockConfigEntry

from custom_components.puppy_tracker.api import websocket_report_logo
from custom_components.puppy_tracker.backup import BackupValidationError, async_apply_import, build_export_document, parse_export_json, prepare_import
from custom_components.puppy_tracker.backup_transaction import async_apply_import_transaction
from custom_components.puppy_tracker.config_flow import PuppyTrackerOptionsFlow
from custom_components.puppy_tracker.const import DOMAIN
from custom_components.puppy_tracker.managed_files import MAX_UPLOAD_BYTES, normalize_logo, validate_file_backup
from custom_components.puppy_tracker.managed_files_http import ManagedFileView, async_setup_managed_files_http
from custom_components.puppy_tracker.runtime import PuppyTrackerRuntimeData


def image_bytes(color="red", size=(120, 60), fmt="PNG"):
    stream = BytesIO()
    Image.new("RGBA" if fmt == "PNG" else "RGB", size, color).save(stream, format=fmt)
    return stream.getvalue()


@pytest.fixture
def files_storage(storage, tmp_path):
    storage.files.config_root = tmp_path.resolve()
    storage.files.root = tmp_path.resolve() / "puppy_tracker" / "files"
    return storage


def attach(hass, storage):
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.runtime_data = PuppyTrackerRuntimeData(storage=storage)
    entry.add_to_hass(hass)
    return entry


def full_backup(storage, files):
    return build_export_document(storage, scope="full", file_data=files,
        care_reminder_settings={"lead_days": 5, "categories": {"vaccination": True, "deworming": True}},
        scheduler_data={"version": 1, "care_programs": {"programs": {}}, "recurring_reminders": {"reminders": {}}})


def test_logo_normalization_strips_transparency_and_bounds_dimensions():
    content = normalize_logo(image_bytes((255, 0, 0, 0), (2048, 1024)))
    with Image.open(BytesIO(content)) as image:
        assert image.format == "JPEG"
        assert image.size == (1024, 512)
        assert image.mode == "RGB"
        assert image.getpixel((0, 0)) == (255, 255, 255)


@pytest.mark.parametrize("content", [b"", b"%PDF-1.7", b"<svg></svg>", b"a" * (MAX_UPLOAD_BYTES + 1)])
def test_logo_rejects_unsupported_or_oversized_content(content):
    with pytest.raises(ValueError):
        normalize_logo(content)


async def test_upload_replace_remove_and_failure_preserve_previous_file(files_storage):
    storage = files_storage
    breeder = {"name": "Kennel", "logo_url": "/local/fallback.png"}
    await storage.async_update_breeder(breeder, logo_content=image_bytes())
    first = storage.get_breeder()["logo_file_id"]
    assert await storage.files.async_read(first) == normalize_logo(image_bytes())
    assert storage.get_managed_files()[first]["content_type"] == "image/jpeg"
    before = storage.get_data()
    storage.async_save = AsyncMock(side_effect=OSError("disk full"))
    with pytest.raises(OSError):
        await storage.async_update_breeder(breeder, logo_content=image_bytes("blue"))
    assert storage.get_data() == before
    assert await storage.files.async_read(first)
    assert {path.name for path in storage.files.root.iterdir()} == {first}
    storage.async_save = AsyncMock()
    await storage.async_update_breeder(breeder, logo_content=image_bytes("blue"))
    second = storage.get_breeder()["logo_file_id"]
    assert first != second
    assert not (storage.files.root / first).exists()
    await storage.async_update_breeder(breeder)
    assert "logo_file_id" not in storage.get_breeder()
    assert storage.get_breeder()["logo_url"] == "/local/fallback.png"
    assert storage.get_managed_files() == {}
    assert not (storage.files.root / second).exists()


async def test_options_flow_upload_preview_and_removal(hass, files_storage, tmp_path, monkeypatch):
    storage = files_storage
    entry = attach(hass, storage)
    monkeypatch.setattr("custom_components.puppy_tracker.breeder_settings_flow.signed_file_path", lambda *_args: "/signed-logo")
    flow = PuppyTrackerOptionsFlow()
    flow.hass = hass
    flow.handler = entry.entry_id
    uploaded = tmp_path / "upload.png"
    uploaded.write_bytes(image_bytes())
    @contextmanager
    def native_upload(_hass, file_id):
        assert file_id == "uploaded-id"
        yield uploaded
    with patch("custom_components.puppy_tracker.breeder_settings_flow.process_uploaded_file", native_upload):
        result = await flow.async_step_breeder({"name": "Kennel", "logo_upload": "uploaded-id"})
    assert result["type"] == "create_entry"
    with patch("custom_components.puppy_tracker.breeder_settings_flow.signed_file_path", return_value="/signed-logo"):
        form = await flow.async_step_breeder()
    assert "![Logo](/signed-logo)" in form["description_placeholders"]["logo_preview"]
    result = await flow.async_step_breeder({"name": "Renamed"})
    assert storage.get_breeder()["logo_file_id"]
    result = await flow.async_step_breeder({"name": "Renamed", "remove_logo": True, "logo_upload": "uploaded-id"})
    assert result["errors"] == {"base": "invalid_logo"}
    result = await flow.async_step_breeder({"name": "Renamed", "remove_logo": True})
    assert result["type"] == "create_entry"
    assert not storage.get_managed_files()


async def test_full_backup_contains_bytes_and_restores_to_empty_file_directory(files_storage, install_litter):
    storage = files_storage
    litter_id, _ = install_litter()
    await storage.async_update_breeder({"name": "Kennel"}, logo_content=image_bytes())
    file_id = storage.get_breeder()["logo_file_id"]
    files = await storage.async_export_managed_files()
    document = full_backup(storage, files)
    assert document["export_version"] == 6
    assert document["file_data"][file_id] == base64.b64encode(await storage.files.async_read(file_id)).decode()
    with pytest.raises(ValueError):
        full_backup(storage, None)
    partial = build_export_document(storage, scope="litter", litter_id=litter_id)
    assert "file_data" not in partial
    parsed = parse_export_json(json.dumps(document))
    await storage.async_update_breeder({})
    assert not (storage.files.root / file_id).exists()
    await async_apply_import(storage, prepare_import(storage, parsed, mode="replace_all"))
    assert storage.get_breeder()["logo_file_id"] == file_id
    assert await storage.files.async_read(file_id)
    await async_apply_import(storage, prepare_import(storage, partial, mode="new_litter"))
    assert storage.get_breeder()["logo_file_id"] == file_id


async def test_invalid_file_backup_does_not_change_storage(files_storage, install_litter):
    storage = files_storage
    install_litter()
    await storage.async_update_breeder({}, logo_content=image_bytes())
    document = full_backup(storage, await storage.async_export_managed_files())
    before = storage.get_data()
    file_id = storage.get_breeder()["logo_file_id"]
    for content in ({}, {file_id: "!!!!"}, {file_id: base64.b64encode(b"bad").decode()}, {"../outside": "AAAA"}):
        invalid = deepcopy(document)
        invalid["file_data"] = content
        with pytest.raises(BackupValidationError):
            prepare_import(storage, invalid, mode="replace_all")
        assert storage.get_data() == before
    invalid = deepcopy(document)
    invalid["data"]["settings"]["files"][file_id]["name"] = "../outside"
    with pytest.raises(ValueError):
        validate_file_backup(invalid["data"]["settings"]["files"], invalid["file_data"])


async def test_external_store_failure_restores_previous_logo_and_cleans_staged_files(files_storage, install_litter):
    storage = files_storage
    install_litter()
    await storage.async_update_breeder({"name": "Source"}, logo_content=image_bytes("blue"))
    document = full_backup(storage, await storage.async_export_managed_files())
    imported_id = storage.get_breeder()["logo_file_id"]
    await storage.async_update_breeder({"name": "Original"}, logo_content=image_bytes("red"))
    old_id = storage.get_breeder()["logo_file_id"]
    before = storage.get_data()
    storage._store.async_save = AsyncMock()
    async def fail_after_file_restore(_settings):
        await storage.async_update_breeder(storage.get_breeder())
        assert await storage.files.async_read(old_id)
        raise OSError("other store failed")
    care = SimpleNamespace(get_snapshot_data=lambda: {}, async_restore_backup_settings=AsyncMock(side_effect=fail_after_file_restore),
                           async_restore_snapshot_data=AsyncMock())
    def scheduler(container):
        return SimpleNamespace(get_backup_data=lambda: {container: {}}, async_restore_backup_data=AsyncMock())
    with pytest.raises(OSError, match="other store failed"):
        await async_apply_import_transaction(storage, prepare_import(storage, document, mode="replace_all"),
            care_reminders=care, care_programs=scheduler("programs"), recurring_reminders=scheduler("reminders"))
    assert storage.get_data() == before
    assert await storage.files.async_read(old_id)
    assert not (storage.files.root / imported_id).exists()
    assert not storage._file_restore_pins


async def test_file_paths_refuse_traversal_symlink_and_unregistered_reads(hass, files_storage, tmp_path):
    storage = files_storage
    attach(hass, storage)
    with pytest.raises(ValueError):
        await storage.files.async_read("../outside")
    storage.files.root.mkdir(parents=True)
    file_id = "a" * 64
    outside = tmp_path / "secret"
    outside.write_bytes(b"secret")
    (storage.files.root / file_id).symlink_to(outside)
    with pytest.raises(ValueError):
        await storage.files.async_read(file_id)
    with pytest.raises(web.HTTPNotFound):
        await ManagedFileView(hass).get(MagicMock(), file_id)
    assert outside.read_bytes() == b"secret"


async def test_logo_endpoint_authentication_and_signed_preview(hass, files_storage, hass_client, hass_client_no_auth):
    storage = files_storage
    attach(hass, storage)
    await storage.async_update_breeder({}, logo_content=image_bytes())
    file_id = storage.get_breeder()["logo_file_id"]
    assert await async_setup_component(hass, "http", {})
    async_setup_managed_files_http(hass)
    client = await hass_client()
    anonymous = await hass_client_no_auth()
    path = f"/api/{DOMAIN}/files/{file_id}"
    assert (await anonymous.get(path)).status == 401
    response = await client.get(path)
    assert response.status == 200
    assert response.headers["Content-Type"] == "image/jpeg"
    assert response.headers["Cache-Control"] == "no-store"
    assert await response.read() == await storage.files.async_read(file_id)
    connection = MagicMock()
    websocket_report_logo(hass, connection, {"id": 1})
    url = connection.send_result.call_args.args[1]["logo_url"]
    assert "authSig=" in url
    assert (await anonymous.get(url)).status == 200
    assert (await client.get(f"/api/{DOMAIN}/files/{'0' * 64}")).status == 404
