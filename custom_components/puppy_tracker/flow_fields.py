"""Native conditional form fields, with visible fields on older HA releases."""

from typing import Any

import voluptuous as vol
from homeassistant import data_entry_flow


def required_when(key: str, field: str, *, default: Any) -> Any:
    """Show a required field when a sibling switch is on (HA 2026.11+)."""
    marker = getattr(data_entry_flow, "Required", None)
    # Older data_entry_flow modules export typing.Required, not a schema marker.
    if not isinstance(marker, type) or not issubclass(marker, vol.Required):
        return vol.Required(key, default=default)
    return marker(key, default=default, visible={"field": field, "value": True})
