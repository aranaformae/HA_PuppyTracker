"""Administrator-only setup guidance and full-backup download."""

from __future__ import annotations

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .backup_http import async_backup_export
from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE
from .runtime import require_runtime_data


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/onboarding",
    vol.Optional("litter_id"): str,
    vol.Optional("visible"): bool,
})
@websocket_api.async_response
async def websocket_onboarding(hass, connection, msg) -> None:
    """Derive progress from real data; the client cannot mark steps complete."""
    runtime = require_runtime_data(hass)
    if runtime.onboarding is None:
        connection.send_error(msg["id"], "not_loaded", "Setup guidance is not loaded")
        return
    try:
        if "visible" in msg:
            await runtime.onboarding.async_set_visible(connection.user.id, msg["visible"])
        result = await runtime.onboarding.async_status(runtime.storage, connection.user.id, msg.get("litter_id"))
    except ValueError as error:
        connection.send_error(msg["id"], "not_found", str(error))
        return
    connection.send_result(msg["id"], result)
    if "visible" in msg:
        async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/onboarding/backup"})
@websocket_api.async_response
async def websocket_onboarding_backup(hass, connection, msg) -> None:
    """Use the same full export as the integration's authenticated download."""
    try:
        result = await async_backup_export(require_runtime_data(hass), scope="full")
    except (ValueError, RuntimeError) as error:
        connection.send_error(msg["id"], "export_failed", str(error))
        return
    connection.send_result(msg["id"], result)
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)


@callback
def async_setup_onboarding_api(hass) -> None:
    """Register once, resolving runtime state anew for every request."""
    key = f"{DOMAIN}_onboarding_api_registered"
    if hass.data.get(key):
        return
    websocket_api.async_register_command(hass, websocket_onboarding)
    websocket_api.async_register_command(hass, websocket_onboarding_backup)
    hass.data[key] = True
