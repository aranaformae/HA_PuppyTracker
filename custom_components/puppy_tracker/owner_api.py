"""Websocket API for reusable owner/contact records."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE
from .runtime import PuppyTrackerRuntimeData


def _owners(hass: HomeAssistant):
    for entry in hass.config_entries.async_entries(DOMAIN):
        runtime = entry.runtime_data
        if isinstance(runtime, PuppyTrackerRuntimeData):
            return runtime.owners
    return None


def _runtime(hass: HomeAssistant) -> PuppyTrackerRuntimeData | None:
    for entry in hass.config_entries.async_entries(DOMAIN):
        runtime = entry.runtime_data
        if isinstance(runtime, PuppyTrackerRuntimeData):
            return runtime
    return None


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/owners/list"})
@callback
def websocket_list_owners(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    owners = _owners(hass)
    if owners is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    connection.send_result(msg["id"], {"owners": owners.get_all()})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/owners/save",
    vol.Optional("owner_id"): str,
    vol.Required("name"): str,
    vol.Optional("email"): vol.Any(str, None),
    vol.Optional("phone"): vol.Any(str, None),
    vol.Optional("address"): vol.Any(str, None),
    vol.Optional("notes"): vol.Any(str, None),
    vol.Optional("role"): str,
    vol.Optional("placement_status"): str,
    vol.Optional("placement_date"): vol.Any(str, None),
    vol.Optional("payment_status"): str,
    vol.Optional("payment_date"): vol.Any(str, None),
})
@websocket_api.async_response
async def websocket_save_owner(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    owners = _owners(hass)
    if owners is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    try:
        owner = await owners.async_upsert(msg, msg.get("owner_id"))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_owner", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"owner": owner})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/owners/delete", vol.Required("owner_id"): str})
@websocket_api.async_response
async def websocket_delete_owner(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    owners = _owners(hass)
    if owners is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    try:
        await owners.async_delete(msg["owner_id"])
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/owners/link",
    vol.Required("litter_id"): str,
    vol.Required("puppy_id"): str,
    vol.Required("owner_ids"): [str],
})
@websocket_api.async_response
async def websocket_link_owners(hass: HomeAssistant, connection, msg: dict[str, Any]) -> None:
    """Link existing reusable owners to one puppy."""
    runtime = _runtime(hass)
    if runtime is None or runtime.owners is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    if any(runtime.owners.get(owner_id) is None for owner_id in msg["owner_ids"]):
        connection.send_error(msg["id"], "invalid_owner", "Unknown owner")
        return
    try:
        await runtime.storage.async_set_puppy_owner_ids(
            msg["litter_id"], msg["puppy_id"], msg["owner_ids"]
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_puppy", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True, "owner_ids": msg["owner_ids"]})


def async_setup_owner_api(hass: HomeAssistant) -> None:
    """Register owner websocket commands once."""
    key = f"{DOMAIN}_owner_api_registered"
    if hass.data.get(key):
        return
    websocket_api.async_register_command(hass, websocket_list_owners)
    websocket_api.async_register_command(hass, websocket_save_owner)
    websocket_api.async_register_command(hass, websocket_delete_owner)
    websocket_api.async_register_command(hass, websocket_link_owners)
    hass.data[key] = True
