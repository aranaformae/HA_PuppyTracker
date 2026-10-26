"""Admin-only document templates, checked generation and immutable PDF archives."""

from __future__ import annotations

import base64
import json
import logging
from copy import deepcopy
from hashlib import sha256
from uuid import uuid4

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.util import dt as dt_util

from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE
from .document_templates import BUILTIN_TEMPLATE_IDS, FIELDS, IDENTIFIER, MAX_DOCUMENTS, MAX_TEMPLATES, built_in_templates, document_context, fingerprint, normalize_template, template_fields, template_uses_logo, validate_document_settings
from .document_pdf import build_document_pdf
from .dog_identity import puppy_selector_label
from .owners import owner_for_litter
from .managed_files import validate_manifest
from .pdf_export import _report_logo
from .runtime import get_runtime_data
from .storage_lock import mutation_coordinator

_LOGGER = logging.getLogger(__name__)


def _public(document):
    return {k: deepcopy(v) for k, v in document.items() if k not in ("snapshot_id", "file_id", "fingerprint")}


async def _templates(hass, storage):
    defaults = await hass.async_add_executor_job(built_in_templates)
    return {**defaults, **storage.get_settings().get("document_templates", {})}


def _download(document, content):
    return {"filename": f"puppy-tracker-contract-{document['id']}.pdf", "mime_type": "application/pdf", "encoding": "base64", "content": base64.b64encode(content).decode("ascii")}


async def _selection(hass, runtime, msg):
    templates = await _templates(hass, runtime.storage)
    template = templates.get(msg["template_id"])
    if template is None:
        raise ValueError("template_missing")
    template = normalize_template(template)
    used_fields = template_fields(template)
    needs_payment = any(key.startswith("ontvangst.") for key in used_fields)
    payment_id = msg.get("payment_id") if needs_payment else None
    if needs_payment and not payment_id:
        raise ValueError("choose_payment_receipt")
    values = document_context(runtime.storage, runtime.owners, msg["litter_id"], msg["puppy_id"], msg["owner_ids"], msg["details"], template["language"], payment_id, include_profile_note="pup.profielnotitie" in used_fields)
    snapshot = {"template": template, "template_revision": fingerprint(template), "values": values}
    breeder = runtime.storage.get_breeder()
    logo = None
    if template_uses_logo(template):
        if breeder.get("logo_file_id"):
            logo = await runtime.storage.files.async_read(breeder["logo_file_id"])
        else:
            # Local-path logos can be supplied by the authenticated frontend via
            # the same bounded JPEG validation used for ordinary PDF reports.
            logo = await hass.async_add_executor_job(_report_logo, msg.get("logo_base64"))
    stamp = fingerprint({"snapshot": snapshot, "logo": sha256(logo or b"").hexdigest(), "logo_path": breeder.get("logo_url", ""), "litter_id": msg["litter_id"], "puppy_id": msg["puppy_id"], "owner_ids": msg["owner_ids"], "payment_id": payment_id})
    missing = sorted(key for key in used_fields if not values.get(key) and key not in template["optional_fields"])
    return snapshot, logo, stamp, missing


async def _handle(hass, connection, msg, operation):
    runtime = get_runtime_data(hass)
    if runtime is None or runtime.owners is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    try:
        result = await operation(runtime)
    except ValueError as err:
        connection.send_error(msg["id"], "document_error", str(err))
        return
    except OSError:
        _LOGGER.exception("Document storage operation failed")
        connection.send_error(msg["id"], "document_error", "document_storage_error")
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/documents/list"})
@websocket_api.async_response
async def websocket_documents_list(hass, connection, msg):
    async def operation(runtime):
        templates = await _templates(hass, runtime.storage)
        settings = runtime.storage.get_settings()
        return {"fields": {key: {"nl": labels[0], "en": labels[1]} for key, labels in FIELDS.items()},
                "templates": [{"id": key, "revision": fingerprint(value), "builtin": key in BUILTIN_TEMPLATE_IDS, "template": value} for key, value in templates.items()],
                "litters": [{"id": key, "name": litter.get("name", ""), "puppies": [{"id": pid, "name": pup.get("name", ""), "collar_color": pup.get("collar_color", ""), "owner_ids": pup.get("owner_ids", [])} for pid, pup in litter.get("puppies", {}).items()]} for key, litter in runtime.storage.get_litters().items()],
                "owners": [{"id": owner["id"], "name": owner["name"], "payments": {
                    litter_id: [{"id": event["id"], "amount": event["amount"], "date": event["date"], "kind": event["kind"], "method": event["method"], "reference": event["reference"]}
                                for event in owner_for_litter(owner, litter_id).get("payment_events", []) if not event["voided_at"]]
                    for litter_id in runtime.storage.get_litters() if litter_id in owner.get("placements", {})}}
                    for owner in runtime.owners.get_all()],
                "documents": sorted((_public(d) for d in settings.get("documents", {}).values()), key=lambda d: d["created_at"], reverse=True)}
    await _handle(hass, connection, msg, operation)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/documents/template/save", vol.Required("template"): dict,
    vol.Optional("template_id"): str, vol.Optional("expected_revision"): str})
@websocket_api.async_response
async def websocket_template_save(hass, connection, msg):
    async def operation(runtime):
        value = normalize_template(msg["template"])
        key = msg.get("template_id") or uuid4().hex
        if key in BUILTIN_TEMPLATE_IDS or not IDENTIFIER.fullmatch(key):
            raise ValueError("copy_builtin_template")
        async with runtime.storage._mutation():
            templates = runtime.storage._data.setdefault("settings", {}).setdefault("document_templates", {})
            old = templates.get(key)
            # Retrying a lost response with identical content is safe.
            if old == value:
                return {"id": key, "revision": fingerprint(value), "template": value}
            if (old is not None and fingerprint(old) != msg.get("expected_revision")) or (old is None and msg.get("expected_revision")):
                raise ValueError("document_conflict")
            if old is None and len(templates) >= MAX_TEMPLATES:
                raise ValueError("document_limit")
            templates[key] = value
            await runtime.storage.async_save()
        async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
        return {"id": key, "revision": fingerprint(value), "template": value}
    await _handle(hass, connection, msg, operation)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/documents/template/delete",
    vol.Required("template_id"): str, vol.Required("expected_revision"): str})
@websocket_api.async_response
async def websocket_template_delete(hass, connection, msg):
    async def operation(runtime):
        if msg["template_id"] in BUILTIN_TEMPLATE_IDS:
            raise ValueError("copy_builtin_template")
        async with runtime.storage._mutation():
            templates = runtime.storage._data.setdefault("settings", {}).setdefault("document_templates", {})
            old = templates.get(msg["template_id"])
            if old is not None:
                if fingerprint(old) != msg["expected_revision"]:
                    raise ValueError("document_conflict")
                del templates[msg["template_id"]]
                await runtime.storage.async_save()
        async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
        return {"ok": True}
    await _handle(hass, connection, msg, operation)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/documents/template/preview", vol.Required("template"): dict,
                                 vol.Optional("logo_base64"): vol.All(str, vol.Length(max=700000))})
@websocket_api.async_response
async def websocket_template_preview(hass, connection, msg):
    async def operation(runtime):
        template = normalize_template(msg["template"])
        language_index = 0 if template["language"] == "nl" else 1
        snapshot = {"template": template, "values": {key: f"[{labels[language_index]}]" for key, labels in FIELDS.items()}}
        logo = None
        if template_uses_logo(template):
            async with runtime.storage._lock:
                logo_id = runtime.storage.get_breeder().get("logo_file_id")
                if logo_id:
                    logo = await runtime.storage.files.async_read(logo_id)
            if logo is None:
                logo = await hass.async_add_executor_job(_report_logo, msg.get("logo_base64"))
        content = await hass.async_add_executor_job(build_document_pdf, snapshot, logo)
        return _download({"id": "template-preview"}, content)
    await _handle(hass, connection, msg, operation)


SELECTION = {vol.Required("template_id"): str, vol.Required("litter_id"): str, vol.Required("puppy_id"): str,
             vol.Required("owner_ids"): vol.All([str], vol.Length(min=1, max=4)), vol.Required("details"): dict,
             vol.Optional("payment_id"): str,
             vol.Optional("logo_base64"): vol.All(str, vol.Length(max=700000))}


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/documents/preview", **SELECTION})
@websocket_api.async_response
async def websocket_document_preview(hass, connection, msg):
    async def operation(runtime):
        async with mutation_coordinator(hass).restore():
            snapshot, logo, stamp, missing = await _selection(hass, runtime, msg)
        content = await hass.async_add_executor_job(build_document_pdf, snapshot, logo)
        return {"fingerprint": stamp, "missing": missing, "download": _download({"id": "preview"}, content)}
    await _handle(hass, connection, msg, operation)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/documents/save", **SELECTION,
                                 vol.Required("expected_fingerprint"): str, vol.Required("request_id"): str})
@websocket_api.async_response
async def websocket_document_save(hass, connection, msg):
    async def operation(runtime):
        key = msg["request_id"]
        if not IDENTIFIER.fullmatch(key):
            raise ValueError("invalid_document")
        storage = runtime.storage
        async with mutation_coordinator(hass).restore():
            old = storage.get_settings().get("documents", {}).get(key)
            if old is not None:
                if old["fingerprint"] != msg["expected_fingerprint"]:
                    raise ValueError("document_conflict")
                return {"document": _public(old), "download": _download(old, await storage.files.async_read(old["file_id"]))}
            snapshot, logo, stamp, missing = await _selection(hass, runtime, msg)
            if stamp != msg["expected_fingerprint"]:
                raise ValueError("document_conflict")
            if missing:
                raise ValueError("document_missing_fields")
            content = await hass.async_add_executor_job(build_document_pdf, snapshot, logo)
            file_id = sha256(content).hexdigest()
            snapshot_content = json.dumps(snapshot, ensure_ascii=False, sort_keys=True).encode()
            snapshot_id = sha256(snapshot_content).hexdigest()
            entry = {"id": key, "name": snapshot["template"]["name"], "created_at": dt_util.utcnow().isoformat(),
                     "litter_id": msg["litter_id"], "puppy_id": msg["puppy_id"],
                     "puppy_name": puppy_selector_label(storage.get_litter(msg["litter_id"])["puppies"][msg["puppy_id"]]),
                     "owner_ids": list(msg["owner_ids"]), "file_id": file_id, "snapshot_id": snapshot_id, "fingerprint": stamp}
            try:
                async with storage._mutation():
                    settings = storage._data.setdefault("settings", {})
                    docs = settings.setdefault("documents", {})
                    if len(docs) >= MAX_DOCUMENTS:
                        raise ValueError("document_limit")
                    files = storage.get_managed_files()
                    files[file_id] = {"name": f"contract-{key}.pdf", "content_type": "application/pdf", "size": len(content)}
                    files[snapshot_id] = {"name": f"contract-{key}.json", "content_type": "application/json", "size": len(snapshot_content)}
                    settings["files"] = validate_manifest(files)
                    docs[key] = entry
                    validate_document_settings(settings)
                    await storage.files.async_write(file_id, content)
                    await storage.files.async_write(snapshot_id, snapshot_content)
                    await storage.async_save()
            except BaseException:
                try:
                    await storage.async_cleanup_managed_files()
                except OSError:
                    _LOGGER.exception("Could not clean up uncommitted document files")
                raise
        async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
        return {"document": _public(entry), "download": _download(entry, content)}
    await _handle(hass, connection, msg, operation)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/documents/download", vol.Required("document_id"): str})
@websocket_api.async_response
async def websocket_document_download(hass, connection, msg):
    async def operation(runtime):
        async with runtime.storage._lock:
            document = runtime.storage.get_settings().get("documents", {}).get(msg["document_id"])
            if not document:
                raise ValueError("document_missing")
            return _download(document, await runtime.storage.files.async_read(document["file_id"]))
    await _handle(hass, connection, msg, operation)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/documents/delete", vol.Required("document_id"): str})
@websocket_api.async_response
async def websocket_document_delete(hass, connection, msg):
    async def operation(runtime):
        storage = runtime.storage
        async with storage._mutation():
            settings = storage._data.setdefault("settings", {})
            removed = settings.get("documents", {}).pop(msg["document_id"], None)
            if removed:
                for field in ("file_id", "snapshot_id"):
                    if not any(d[field] == removed[field] for d in settings["documents"].values()):
                        settings.get("files", {}).pop(removed[field], None)
                await storage.async_save()
        await storage.async_cleanup_managed_files()
        async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
        return {"ok": True}
    await _handle(hass, connection, msg, operation)


def async_setup_document_api(hass):
    for command in (websocket_documents_list, websocket_template_save, websocket_template_delete, websocket_template_preview, websocket_document_preview,
                    websocket_document_save, websocket_document_download, websocket_document_delete):
        websocket_api.async_register_command(hass, command)
