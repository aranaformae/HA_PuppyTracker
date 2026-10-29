"""Small public dossier events for Home Assistant automations."""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant

from .const import EVENT_DOSSIER_RECORD_CHANGED


def fire_dossier_record_changed(
    hass: HomeAssistant,
    action: str,
    record: dict[str, Any],
    *,
    previous_scope: str | None = None,
    previous_puppy_id: str | None = None,
) -> None:
    """Publish identity and ownership only, never private notes or record data."""
    payload = {
        "action": action,
        "litter_id": record["litter_id"],
        "record_id": record["id"],
        "record_type": record["type"],
        "scope": record["scope"],
        "puppy_id": record.get("puppy_id"),
    }
    if action == "owner_changed":
        payload["previous_scope"] = previous_scope
        payload["previous_puppy_id"] = previous_puppy_id
    hass.bus.async_fire(EVENT_DOSSIER_RECORD_CHANGED, payload)
