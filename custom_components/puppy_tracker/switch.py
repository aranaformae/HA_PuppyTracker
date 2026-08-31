"""Switch entities for Puppy Tracker care reminders."""

from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback

from .care_reminders import CareReminderStore
from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE
from .runtime import PuppyTrackerRuntimeData


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up care reminder category switches."""
    async_add_entities(
        [
            CareReminderCategorySwitch(
                entry,
                category="vaccination",
                name="Vaccinatieherinneringen",
                icon="mdi:needle",
            ),
            CareReminderCategorySwitch(
                entry,
                category="deworming",
                name="Ontwormingsherinneringen",
                icon="mdi:shield-bug-outline",
            ),
        ]
    )


class CareReminderCategorySwitch(SwitchEntity):
    """Enable or disable reminders for one care category."""

    _attr_has_entity_name = True

    def __init__(
        self,
        entry: ConfigEntry,
        *,
        category: str,
        name: str,
        icon: str,
    ) -> None:
        self._entry = entry
        self._category = category
        self._attr_name = name
        self._attr_icon = icon
        self._attr_unique_id = f"puppy_tracker_care_reminder_{category}"

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
    def is_on(self) -> bool:
        """Return whether this reminder category is enabled."""
        return self.store.category_enabled(self._category)

    async def async_turn_on(self, **kwargs) -> None:
        """Enable this care reminder category."""
        await self.store.async_set_category_enabled(self._category, True)
        self.async_write_ha_state()
        async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)

    async def async_turn_off(self, **kwargs) -> None:
        """Disable this care reminder category."""
        await self.store.async_set_category_enabled(self._category, False)
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
