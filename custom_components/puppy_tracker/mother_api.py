"""WebSocket API for reusable mother dossiers."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.util import dt as dt_util

from .api import API_VERSION, _runtime_storage, _signal_dossier_change
from .const import DOMAIN
from .mother_context import mother_context_payload
from .mother_storage import MotherScopeStorage

DATA_MOTHER_API_REGISTERED = f"{DOMAIN}_mother_api_registered"


def _storage_or_error(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> MotherScopeStorage | None:
    storage = _runtime_storage(hass)
    if not isinstance(storage, MotherScopeStorage):
        connection.send_error(msg["id"], "not_loaded", "Mother dossier support is not loaded")
        return None
    return storage


def _mother_for_litter_or_error(
    storage: MotherScopeStorage,
    litter_id: str,
) -> dict[str, Any]:
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")
    mother = storage.get_mother_for_litter(litter_id)
    if mother is None:
        raise ValueError("This litter has no linked mother profile")
    return mother


def _mother_records_payload(
    storage: MotherScopeStorage,
    litter_id: str,
    *,
    history_scope: str,
    include_deleted: bool,
    can_manage_records: bool,
) -> dict[str, Any]:
    mother = _mother_for_litter_or_error(storage, litter_id)
    mother_id = str(mother["id"])
    filter_litter_id = litter_id if history_scope == "current" else None
    context = mother_context_payload(
        storage.get_data(),
        mother_id,
        litter_id=filter_litter_id,
        include_deleted=include_deleted,
    )
    if context is None:
        raise ValueError("Unknown mother")
    return {
        "api_version": API_VERSION,
        "generated_at": dt_util.now().isoformat(),
        "storage_updated_at": storage.get_data().get("updated_at"),
        "can_manage_records": can_manage_records,
        "include_deleted": include_deleted,
        "history_scope": history_scope,
        "litter": {
            "id": litter_id,
            "name": storage.get_litter(litter_id).get("name"),
        },
        "owner": {
            "scope": "mother",
            "id": mother_id,
            "name": mother.get("name"),
            "profile_note": mother.get("profile_note"),
        },
        "linked_litters": context["linked_litters"],
        "actions": {"actions": []},
        "records": context["records"],
    }


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mother/records",
        vol.Required("litter_id"): str,
        vol.Optional("history_scope", default="current"): vol.In(("current", "all")),
        vol.Optional("include_deleted", default=False): bool,
    }
)
@callback
def websocket_get_mother_records(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return a mother dossier, filtered to this litter by default."""
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return
    can_manage = bool(connection.user and connection.user.is_admin)
    try:
        result = _mother_records_payload(
            storage,
            msg["litter_id"],
            history_scope=msg.get("history_scope", "current"),
            include_deleted=bool(msg.get("include_deleted", False)) and can_manage,
            can_manage_records=can_manage,
        )
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mother/profile_note/update",
        vol.Required("litter_id"): str,
        vol.Optional("profile_note"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def websocket_update_mother_profile_note(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return
    try:
        mother = _mother_for_litter_or_error(storage, msg["litter_id"])
        await storage.async_update_mother_profile_note(
            str(mother["id"]), msg.get("profile_note")
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_mother", str(err))
        return
    _signal_dossier_change(hass)
    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "mother_id": mother["id"],
            "profile_note": storage.get_mother(str(mother["id"])).get("profile_note"),
        },
    )


def _record_litter_id(storage: MotherScopeStorage, mother_id: str, record_id: str) -> str:
    mother = storage.get_mother(mother_id)
    if mother is None:
        raise ValueError("Unknown mother")
    for record in mother.get("records", []):
        if isinstance(record, dict) and str(record.get("id")) == record_id:
            litter_id = str(record.get("litter_id") or "")
            if not litter_id:
                raise ValueError("Mother record has no litter context")
            return litter_id
    raise ValueError("Unknown mother dossier record")


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mother/record/add",
        vol.Required("litter_id"): str,
        vol.Required("record_type"): str,
        vol.Optional("occurred_at"): str,
        vol.Optional("title"): vol.Any(str, None),
        vol.Optional("note"): vol.Any(str, None),
        vol.Optional("data", default={}): dict,
    }
)
@websocket_api.async_response
async def websocket_add_mother_record(hass, connection, msg) -> None:
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return
    try:
        mother = _mother_for_litter_or_error(storage, msg["litter_id"])
        mother_id = str(mother["id"])
        record_id = await storage.async_add_record(
            msg["litter_id"],
            mother_id=mother_id,
            record_type=msg["record_type"],
            occurred_at=msg.get("occurred_at"),
            title=msg.get("title"),
            note=msg.get("note"),
            data=msg.get("data") or {},
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_record", str(err))
        return
    _signal_dossier_change(hass)
    connection.send_result(
        msg["id"],
        {"ok": True, "record_id": record_id, "record": storage.get_record(msg["litter_id"], record_id, mother_id=mother_id)},
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mother/record/update",
        vol.Required("litter_id"): str,
        vol.Required("record_id"): str,
        vol.Required("record_type"): str,
        vol.Optional("occurred_at"): str,
        vol.Optional("title"): vol.Any(str, None),
        vol.Optional("note"): vol.Any(str, None),
        vol.Optional("data", default={}): dict,
    }
)
@websocket_api.async_response
async def websocket_update_mother_record(hass, connection, msg) -> None:
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return
    try:
        mother = _mother_for_litter_or_error(storage, msg["litter_id"])
        mother_id = str(mother["id"])
        record_litter_id = _record_litter_id(storage, mother_id, msg["record_id"])
        await storage.async_update_record(
            record_litter_id,
            msg["record_id"],
            mother_id=mother_id,
            record_type=msg["record_type"],
            occurred_at=msg.get("occurred_at"),
            title=msg.get("title"),
            note=msg.get("note"),
            data=msg.get("data") or {},
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_record", str(err))
        return
    _signal_dossier_change(hass)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mother/record/delete",
        vol.Required("litter_id"): str,
        vol.Required("record_id"): str,
    }
)
@websocket_api.async_response
async def websocket_delete_mother_record(hass, connection, msg) -> None:
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return
    try:
        mother = _mother_for_litter_or_error(storage, msg["litter_id"])
        mother_id = str(mother["id"])
        record_litter_id = _record_litter_id(storage, mother_id, msg["record_id"])
        await storage.async_delete_record(record_litter_id, msg["record_id"], mother_id=mother_id)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_record", str(err))
        return
    _signal_dossier_change(hass)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mother/record/restore",
        vol.Required("litter_id"): str,
        vol.Required("record_id"): str,
    }
)
@websocket_api.async_response
async def websocket_restore_mother_record(hass, connection, msg) -> None:
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return
    try:
        mother = _mother_for_litter_or_error(storage, msg["litter_id"])
        mother_id = str(mother["id"])
        record_litter_id = _record_litter_id(storage, mother_id, msg["record_id"])
        await storage.async_restore_record(record_litter_id, msg["record_id"], mother_id=mother_id)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_record", str(err))
        return
    _signal_dossier_change(hass)
    connection.send_result(msg["id"], {"ok": True})


@callback
def async_setup_mother_api(hass: HomeAssistant) -> None:
    """Register mother dossier WebSocket commands once."""
    if hass.data.get(DATA_MOTHER_API_REGISTERED):
        return
    for command in (
        websocket_get_mother_records,
        websocket_update_mother_profile_note,
        websocket_add_mother_record,
        websocket_update_mother_record,
        websocket_delete_mother_record,
        websocket_restore_mother_record,
    ):
        websocket_api.async_register_command(hass, command)
    hass.data[DATA_MOTHER_API_REGISTERED] = True
