"""WebSocket API for Attention acknowledgement state."""

from __future__ import annotations

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .api import _runtime_data, _runtime_storage
from .attention_acknowledgements import AttentionAcknowledgementStore
from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE

DATA_API_REGISTERED = f"{DOMAIN}_attention_acknowledgement_api_registered"


def _store_or_error(hass: HomeAssistant, connection, msg) -> AttentionAcknowledgementStore | None:
    runtime = _runtime_data(hass)
    store = getattr(runtime, "attention_acknowledgements", None) if runtime is not None else None
    if not isinstance(store, AttentionAcknowledgementStore):
        connection.send_error(msg["id"], "not_loaded", "Attention acknowledgements are not loaded")
        return None
    return store


def _validate_litter(hass: HomeAssistant, connection, msg) -> bool:
    storage = _runtime_storage(hass)
    if storage is None or storage.get_litter(str(msg.get("litter_id") or "")) is None:
        connection.send_error(msg["id"], "not_found", "Unknown litter")
        return False
    return True


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/attention_acknowledgements",
    vol.Required("litter_id"): str,
})
@websocket_api.async_response
async def websocket_list_acknowledgements(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    if store is None or not _validate_litter(hass, connection, msg):
        return
    connection.send_result(
        msg["id"],
        {"acknowledgements": store.get_acknowledgements(msg["litter_id"])},
    )


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/attention_acknowledgement/set",
    vol.Required("litter_id"): str,
    vol.Required("attention_id"): str,
    vol.Required("acknowledged"): bool,
})
@websocket_api.async_response
async def websocket_set_acknowledgement(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    if store is None or not _validate_litter(hass, connection, msg):
        return
    try:
        await store.async_set(
            msg["litter_id"],
            msg["attention_id"],
            bool(msg["acknowledged"]),
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_acknowledgement", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True})


@callback
def async_setup_attention_acknowledgement_api(hass: HomeAssistant) -> None:
    """Register Attention acknowledgement websocket commands once."""
    if hass.data.get(DATA_API_REGISTERED):
        return
    websocket_api.async_register_command(hass, websocket_list_acknowledgements)
    websocket_api.async_register_command(hass, websocket_set_acknowledgement)
    hass.data[DATA_API_REGISTERED] = True
