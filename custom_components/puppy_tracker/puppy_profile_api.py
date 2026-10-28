"""Admin-only puppy profile editing for the dashboard overview."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN, SIGNAL_NEW_PUPPY
from .devices import async_sync_devices
from .runtime import get_runtime_storage
from .updates import dispatch_measurement_update


PROFILE_SCHEMA = vol.Schema(
    {
        vol.Required("name"): vol.All(str, vol.Length(min=1, max=160)),
        vol.Optional("registered_name"): vol.Any(str, None),
        vol.Optional("collar_color"): vol.Any(str, None),
        vol.Optional("coat_color"): vol.Any(str, None),
        vol.Optional("breed"): vol.Any(str, None),
        vol.Optional("sex"): vol.Any("male", "female", None),
        vol.Optional("birth_weight"): vol.Any(
            None, vol.All(vol.Coerce(float), vol.Range(min=1, max=5000))
        ),
        vol.Optional("birth_time"): vol.Any(str, None),
        vol.Optional("chip_number"): vol.Any(str, None),
        vol.Optional("profile_note"): vol.Any(str, None),
    },
    extra=vol.PREVENT_EXTRA,
)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/puppy_profile/save",
        vol.Required("litter_id"): str,
        vol.Optional("puppy_id"): str,
        vol.Optional("expected_updated_at"): vol.Any(str, None),
        vol.Required("profile"): PROFILE_SCHEMA,
    }
)
@websocket_api.async_response
async def websocket_save_puppy_profile(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Add or update one puppy using the canonical storage operations."""
    storage = get_runtime_storage(hass)
    if storage is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Tracker is not loaded")
        return
    litter = storage.get_litter(msg["litter_id"])
    if litter is None:
        connection.send_error(msg["id"], "invalid_litter", "Litter no longer exists")
        return
    puppy_id = msg.get("puppy_id")
    if puppy_id:
        puppy = storage.get_puppy(msg["litter_id"], puppy_id)
        if puppy is None:
            connection.send_error(msg["id"], "invalid_puppy", "Puppy no longer exists")
            return
        if msg.get("expected_updated_at") != puppy.get("updated_at"):
            connection.send_error(msg["id"], "stale_profile", "Puppy details changed; reopen the editor")
            return
    elif not litter.get("active", True):
        connection.send_error(msg["id"], "inactive_litter", "Cannot add to an archived litter")
        return

    profile = dict(msg["profile"])
    profile["name"] = profile["name"].strip()
    if not profile["name"]:
        connection.send_error(msg["id"], "invalid_name", "Enter a puppy name")
        return
    try:
        if puppy_id:
            await storage.async_update_puppy(
                msg["litter_id"], puppy_id,
                name=profile["name"],
                collar_color=profile.get("collar_color"),
                sex=profile.get("sex"),
                birth_weight=profile.get("birth_weight"),
                birth_time=profile.get("birth_time"),
                profile_note=profile.get("profile_note"),
                registered_name=profile.get("registered_name"),
                coat_color=profile.get("coat_color"),
                breed=profile.get("breed"),
                chip_number=profile.get("chip_number"),
            )
        else:
            puppy_id = await storage.async_add_puppy(msg["litter_id"], **profile)
    except (ValueError, TypeError) as err:
        connection.send_error(msg["id"], "invalid_profile", str(err))
        return

    for entry in hass.config_entries.async_entries(DOMAIN):
        if getattr(entry, "runtime_data", None) is not None:
            async_sync_devices(hass, entry, storage.get_data())
            break
    if not msg.get("puppy_id"):
        async_dispatcher_send(hass, SIGNAL_NEW_PUPPY, msg["litter_id"], puppy_id)
    dispatch_measurement_update(hass, puppy_id)
    saved = storage.get_puppy(msg["litter_id"], puppy_id)
    connection.send_result(msg["id"], {"puppy_id": puppy_id, "updated_at": saved.get("updated_at")})


def async_setup_puppy_profile_api(hass: HomeAssistant) -> None:
    """Register the puppy profile command."""
    websocket_api.async_register_command(hass, websocket_save_puppy_profile)
