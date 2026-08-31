"""Shared notification delivery helpers for Puppy Tracker."""

from __future__ import annotations

from collections.abc import Iterable

from homeassistant.core import HomeAssistant


def normalize_notify_entities(values: Iterable[object] | None) -> list[str]:
    """Return valid notify entity IDs while preserving configured order."""
    if values is None:
        return []
    return [
        str(entity_id)
        for entity_id in values
        if isinstance(entity_id, str) and entity_id.startswith("notify.")
    ]


async def async_send_notify_entities(
    hass: HomeAssistant,
    notify_entities: Iterable[object] | None,
    title: str,
    message: str,
    *,
    strict: bool = False,
) -> None:
    """Send one message to configured notify entities.

    Automatic notification paths use best-effort delivery so one unavailable
    mobile target cannot interrupt reminder reconciliation. Explicit test
    notifications use ``strict=True`` so configuration or delivery failures are
    reported back to the initiating options flow.
    """
    targets = normalize_notify_entities(notify_entities)
    if not targets:
        return

    if not hass.services.has_service("notify", "send_message"):
        if strict:
            raise ValueError("notify.send_message service is unavailable")
        return

    for entity_id in targets:
        try:
            await hass.services.async_call(
                "notify",
                "send_message",
                {
                    "entity_id": entity_id,
                    "title": title,
                    "message": message,
                },
                blocking=strict,
            )
        except Exception:
            if strict:
                raise
