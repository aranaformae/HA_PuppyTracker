"""Device registry helpers for Puppy Tracker."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers import device_registry as dr
from homeassistant.helpers import entity_registry as er

from .const import DOMAIN


def _litter_identifier(
    litter_id: str,
) -> tuple[str, str]:
    """Return litter device identifier."""
    return (
        DOMAIN,
        f"litter_{litter_id}",
    )


def _puppy_identifier(
    puppy_id: str,
) -> tuple[str, str]:
    """Return puppy device identifier."""
    return (
        DOMAIN,
        f"puppy_{puppy_id}",
    )


def async_sync_devices(
    hass: HomeAssistant,
    entry: ConfigEntry,
    data: dict[str, Any],
) -> None:
    """Create or update litter and puppy devices."""

    registry = dr.async_get(hass)

    for litter_id, litter in data.get(
        "litters",
        {},
    ).items():
        litter_device = registry.async_get_or_create(
            config_entry_id=entry.entry_id,
            identifiers={
                _litter_identifier(
                    litter_id
                )
            },
            name=litter.get(
                "name",
                "Puppy litter",
            ),
            manufacturer="Puppy Tracker",
            model="Litter",
        )

        for puppy_id, puppy in litter.get(
            "puppies",
            {},
        ).items():
            registry.async_get_or_create(
                config_entry_id=entry.entry_id,
                identifiers={
                    _puppy_identifier(
                        puppy_id
                    )
                },

                # The visible name may safely change.
                # The UUID identifier above never changes.
                name=puppy.get(
                    "name",
                    "Puppy",
                ),

                manufacturer="Puppy Tracker",
                model="Puppy",

                # Puppy belongs to this litter.
                via_device_id=litter_device.id,
            )


def async_remove_puppy_device(
    hass: HomeAssistant,
    entry: ConfigEntry,
    puppy_id: str,
) -> None:
    """Remove puppy device and all its entities."""

    device_registry = dr.async_get(hass)
    entity_registry = er.async_get(hass)

    device = device_registry.async_get_device_by_identifier(
        _puppy_identifier(
            puppy_id
        ),
        entry.entry_id,
    )

    if device is None:
        return

    for entity in list(
        er.async_entries_for_device(
            entity_registry,
            device.id,
            include_disabled_entities=True,
        )
    ):
        entity_registry.async_remove(
            entity.entity_id
        )

    device_registry.async_remove_device(
        device.id
    )


def async_remove_litter_device(
    hass: HomeAssistant,
    entry: ConfigEntry,
    litter_id: str,
    puppy_ids: list[str],
) -> None:
    """Remove litter and all its puppy devices."""

    for puppy_id in puppy_ids:
        async_remove_puppy_device(
            hass,
            entry,
            puppy_id,
        )

    device_registry = dr.async_get(hass)

    device = device_registry.async_get_device_by_identifier(
        _litter_identifier(
            litter_id
        ),
        entry.entry_id,
    )

    if device is not None:
        device_registry.async_remove_device(
            device.id
        )