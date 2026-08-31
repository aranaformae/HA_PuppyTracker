"""Number entities for Puppy Tracker."""

from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfMass, UnitOfTime
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import (
    async_dispatcher_connect,
    async_dispatcher_send,
)
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .care_reminders import CareReminderStore, MAX_CARE_REMINDER_LEAD_DAYS
from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE
from .runtime import PuppyTrackerRuntimeData


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up number entities."""

    async_add_entities(
        [
            PuppyWeightInput(
                hass,
                entry,
            ),
            CareReminderLeadDays(entry),
        ]
    )


class PuppyWeightInput(NumberEntity):
    """Temporary dashboard weight input."""

    _attr_has_entity_name = True
    _attr_name = "Gewicht invoeren"
    _attr_icon = "mdi:scale"
    _attr_unique_id = "puppy_tracker_weight_input"

    _attr_native_min_value = 0
    _attr_native_max_value = 10000
    _attr_native_step = 1
    _attr_native_unit_of_measurement = UnitOfMass.GRAMS
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
    def data(self) -> PuppyTrackerRuntimeData:
        """Return integration runtime data."""

        runtime = self._entry.runtime_data
        if not isinstance(runtime, PuppyTrackerRuntimeData):
            raise RuntimeError("Puppy Tracker runtime is unavailable")
        return runtime

    @property
    def native_value(self) -> float:
        """Return entered weight."""

        return float(self.data.weight_input)

    async def async_set_native_value(self, value: float) -> None:
        """Set draft weight."""

        self.data.weight_input = float(value)
        self.async_write_ha_state()
        async_dispatcher_send(
            self.hass,
            SIGNAL_DASHBOARD_UPDATE,
        )

    async def async_added_to_hass(self) -> None:
        """Subscribe to dashboard changes."""

        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_DASHBOARD_UPDATE,
                self._handle_update,
            )
        )

    @callback
    def _handle_update(self) -> None:
        """Refresh number state."""

        self.async_write_ha_state()

    @property
    def device_info(self) -> DeviceInfo:
        """Return weighing station device."""

        return DeviceInfo(
            identifiers={(DOMAIN, "weighing_station")},
            name="Puppy weegstation",
            manufacturer="Puppy Tracker",
            model="Weegstation",
        )


class CareReminderLeadDays(NumberEntity):
    """Configure when the first care reminder is emitted."""

    _attr_has_entity_name = True
    _attr_name = "Zorgherinnering vooraf"
    _attr_icon = "mdi:calendar-clock"
    _attr_unique_id = "puppy_tracker_care_reminder_lead_days"

    _attr_native_min_value = 0
    _attr_native_max_value = MAX_CARE_REMINDER_LEAD_DAYS
    _attr_native_step = 1
    _attr_native_unit_of_measurement = UnitOfTime.DAYS
    _attr_mode = NumberMode.BOX

    def __init__(self, entry: ConfigEntry) -> None:
        self._entry = entry

    @property
    def store(self) -> CareReminderStore:
        """Return loaded care reminder storage."""
        runtime = self._entry.runtime_data
        if not isinstance(runtime, PuppyTrackerRuntimeData):
            raise RuntimeError("Puppy Tracker runtime is unavailable")
        store = runtime.care_reminders
        if not isinstance(store, CareReminderStore):
            raise RuntimeError("Puppy Tracker care reminder store is unavailable")
        return store

    @property
    def native_value(self) -> float:
        """Return configured first lead time."""
        return float(self.store.get_lead_days())

    async def async_set_native_value(self, value: float) -> None:
        """Set the first reminder lead time in whole days."""
        await self.store.async_set_lead_days(int(round(value)))
        self.async_write_ha_state()
        async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)

    @property
    def device_info(self) -> DeviceInfo:
        """Return the care reminder device."""
        return DeviceInfo(
            identifiers={(DOMAIN, "care_reminders")},
            name="Puppy verzorging",
            manufacturer="Puppy Tracker",
            model="Dossierherinneringen",
        )
