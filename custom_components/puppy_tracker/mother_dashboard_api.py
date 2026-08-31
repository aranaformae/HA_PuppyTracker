"""Dashboard helpers for mother dossier attention and export."""

from __future__ import annotations

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .api import _runtime_storage
from .const import DOMAIN
from .dossier_actions import dossier_action_summary
from .mother_backup_http import async_signed_mother_export_path
from .mother_context import mother_context_payload
from .mother_storage import MotherScopeStorage

DATA_MOTHER_DASHBOARD_API_REGISTERED = f"{DOMAIN}_mother_dashboard_api_registered"


def _storage(hass: HomeAssistant) -> MotherScopeStorage:
    storage = _runtime_storage(hass)
    if not isinstance(storage, MotherScopeStorage):
        raise ValueError("Mother dossier support is not loaded")
    return storage


def _mother_for_litter(storage: MotherScopeStorage, litter_id: str) -> dict:
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")
    mother = storage.get_mother_for_litter(litter_id)
    if mother is None:
        raise ValueError("This litter has no linked mother profile")
    return mother


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mother/attention",
        vol.Required("litter_id"): str,
    }
)
@callback
def websocket_mother_attention(hass, connection, msg) -> None:
    """Return upcoming dossier actions for the current litter's mother."""
    try:
        storage = _storage(hass)
        mother = _mother_for_litter(storage, msg["litter_id"])
        context = mother_context_payload(
            storage.get_data(),
            str(mother["id"]),
            litter_id=msg["litter_id"],
            include_deleted=False,
        )
        if context is None:
            raise ValueError("Unknown mother")
        summary = dossier_action_summary(context.get("records", []))
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return

    connection.send_result(
        msg["id"],
        {
            "owner": {
                "scope": "mother",
                "id": str(mother["id"]),
                "name": mother.get("name"),
            },
            "litter_id": msg["litter_id"],
            "dossier_actions": summary,
        },
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/mother/export_url",
        vol.Required("litter_id"): str,
        vol.Optional("history_scope", default="all"): vol.In(("current", "all")),
    }
)
@websocket_api.async_response
async def websocket_mother_export_url(hass, connection, msg) -> None:
    """Return a short-lived mother dossier JSON download URL."""
    try:
        storage = _storage(hass)
        mother = _mother_for_litter(storage, msg["litter_id"])
        url = async_signed_mother_export_path(
            hass,
            mother_id=str(mother["id"]),
            litter_id=msg["litter_id"] if msg.get("history_scope") == "current" else None,
        )
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return

    connection.send_result(
        msg["id"],
        {
            "url": url,
            "history_scope": msg.get("history_scope", "all"),
            "mother_id": str(mother["id"]),
            "mother_name": mother.get("name"),
        },
    )


@callback
def async_setup_mother_dashboard_api(hass: HomeAssistant) -> None:
    """Register mother dashboard WebSocket helpers once."""
    if hass.data.get(DATA_MOTHER_DASHBOARD_API_REGISTERED):
        return
    websocket_api.async_register_command(hass, websocket_mother_attention)
    websocket_api.async_register_command(hass, websocket_mother_export_url)
    hass.data[DATA_MOTHER_DASHBOARD_API_REGISTERED] = True
