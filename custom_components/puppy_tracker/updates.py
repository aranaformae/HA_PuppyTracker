"""Canonical dispatcher updates after Puppy Tracker data mutations."""

from __future__ import annotations

from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import SIGNAL_DASHBOARD_UPDATE, SIGNAL_UPDATE


def dispatch_measurement_update(hass: HomeAssistant, puppy_id: str) -> None:
    """Refresh entities, dashboards and monitoring after a weight mutation."""
    async_dispatcher_send(hass, SIGNAL_UPDATE, puppy_id)
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)


def dispatch_dossier_update(
    hass: HomeAssistant,
    *puppy_ids: str | None,
) -> None:
    """Refresh dashboards once and each affected puppy once."""
    seen: set[str] = set()
    for puppy_id in puppy_ids:
        if puppy_id is None or puppy_id in seen:
            continue
        seen.add(puppy_id)
        async_dispatcher_send(hass, SIGNAL_UPDATE, puppy_id)
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
