"""Number entities for Puppy Weight Tracker."""

from __future__ import annotations

from typing import Any

from homeassistant.components.number import (
    NumberEntity,
    NumberMode,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfMass
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import (
    async_dispatcher_connect,
    async_dispatcher_send,
)
from homeassistant.helpers.entity_platform import (
    AddConfigEntryEntitiesCallback,
)

from .const import (
    DOMAIN,
    SIGNAL_DASHBOARD_UPDATE,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up weight input."""

    async_add_entities(
        [
            PuppyWeightInput(
                hass,
                entry,
            )
        ]
    )


class PuppyWeightInput(
    NumberEntity
):
    """Temporary dashboard weight input."""

    _attr_has_entity_name = True
    _attr_name = "Gewicht invoeren"
    _attr_icon = "mdi:scale"
    _attr_unique_id = (
        "puppy_weight_tracker_weight_input"
    )

    _attr_native_min_value = 0
    _attr_native_max_value = 10000
    _attr_native_step = 1
    _attr_native_unit_of_measurement = (
        UnitOfMass.GRAMS
    )
    _attr_mode = NumberMode.BOX

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
    ) -> None:
        """Initialize weight input."""

        self._hass = hass
        self._entry = entry

    @property
    def data(
        self,
    ) -> dict[str, Any]:
        """Return integration runtime data."""

        return self._hass.data[
            DOMAIN
        ][
            self._entry.entry_id
        ]

    @property
    def native_value(
        self,
    ) -> float:
        """Return entered weight."""

        return float(
            self.data.get(
                "weight_input",
                0.0,
            )
        )

    async def async_set_native_value(
        self,
        value: float,
    ) -> None:
        """Set draft weight."""

        self.data[
            "weight_input"
        ] = float(
            value
        )

        self.async_write_ha_state()

        async_dispatcher_send(
            self.hass,
            SIGNAL_DASHBOARD_UPDATE,
        )

    async def async_added_to_hass(
        self,
    ) -> None:
        """Subscribe to dashboard changes."""

        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_DASHBOARD_UPDATE,
                self._handle_update,
            )
        )

    @callback
    def _handle_update(
        self,
    ) -> None:
        """Refresh number state."""

        self.async_write_ha_state()

    @property
    def device_info(
        self,
    ) -> DeviceInfo:
        """Return weighing station device."""

        return DeviceInfo(
            identifiers={
                (
                    DOMAIN,
                    "weighing_station",
                )
            },
            name="Puppy weegstation",
            manufacturer=(
                "Puppy Weight Tracker"
            ),
            model="Weegstation",
        )