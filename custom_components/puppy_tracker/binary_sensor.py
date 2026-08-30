"""Binary sensor platform for Puppy Weight Tracker."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from homeassistant.components.binary_sensor import (
    BinarySensorDeviceClass,
    BinarySensorEntity,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import (
    async_dispatcher_connect,
)
from homeassistant.helpers.entity_platform import (
    AddConfigEntryEntitiesCallback,
)
from homeassistant.helpers.event import async_track_time_interval

from .const import (
    DOMAIN,
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_NEW_LITTER,
    SIGNAL_NEW_PUPPY,
    SIGNAL_UPDATE,
)
from .metrics import calculate_puppy_status
from .runtime import PuppyWeightTrackerRuntimeData
from .storage import PuppyWeightStorage

REFRESH_INTERVAL = timedelta(minutes=10)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up Puppy Weight Tracker binary sensors."""

    runtime = entry.runtime_data
    if not isinstance(runtime, PuppyWeightTrackerRuntimeData):
        raise RuntimeError("Puppy Weight Tracker runtime is unavailable")
    storage = runtime.storage

    known_litters: set[str] = set()
    known_puppies: set[str] = set()

    def create_litter_entity(litter_id: str) -> BinarySensorEntity:
        known_litters.add(litter_id)
        return LitterAttentionBinarySensor(storage, litter_id)

    def create_puppy_entity(
        litter_id: str,
        puppy_id: str,
    ) -> BinarySensorEntity:
        known_puppies.add(puppy_id)
        return PuppyAttentionBinarySensor(storage, litter_id, puppy_id)

    entities: list[BinarySensorEntity] = []

    for litter_id, litter in storage.get_litters().items():
        entities.append(create_litter_entity(litter_id))
        for puppy_id in litter.get("puppies", {}):
            entities.append(create_puppy_entity(litter_id, puppy_id))

    async_add_entities(entities)

    @callback
    def handle_new_litter(litter_id: str) -> None:
        if litter_id in known_litters:
            return
        async_add_entities([create_litter_entity(litter_id)])

    @callback
    def handle_new_puppy(litter_id: str, puppy_id: str) -> None:
        if puppy_id in known_puppies:
            return
        async_add_entities([create_puppy_entity(litter_id, puppy_id)])

    entry.async_on_unload(
        async_dispatcher_connect(hass, SIGNAL_NEW_LITTER, handle_new_litter)
    )
    entry.async_on_unload(
        async_dispatcher_connect(hass, SIGNAL_NEW_PUPPY, handle_new_puppy)
    )


class PuppyAttentionBinarySensor(BinarySensorEntity):
    """Indicate whether one puppy needs attention."""

    _attr_has_entity_name = True
    _attr_name = "Aandacht nodig"
    _attr_device_class = BinarySensorDeviceClass.PROBLEM
    _attr_icon = "mdi:alert-circle-outline"

    def __init__(
        self,
        storage: PuppyWeightStorage,
        litter_id: str,
        puppy_id: str,
    ) -> None:
        self.storage = storage
        self._litter_id = litter_id
        self._puppy_id = puppy_id
        self._attr_unique_id = f"{puppy_id}_attention"

    @property
    def puppy(self) -> dict[str, Any] | None:
        return self.storage.get_puppy(self._litter_id, self._puppy_id)

    @property
    def available(self) -> bool:
        return self.puppy is not None

    @property
    def device_info(self) -> DeviceInfo:
        puppy = self.puppy or {}
        return DeviceInfo(
            identifiers={(DOMAIN, f"puppy_{self._puppy_id}")},
            name=puppy.get("name", "Puppy"),
            manufacturer="Puppy Weight Tracker",
            model="Puppy",
        )

    def _status(self) -> dict[str, Any]:
        return calculate_puppy_status(
            self.storage,
            self._litter_id,
            self._puppy_id,
        )

    @property
    def is_on(self) -> bool:
        puppy = self.puppy
        if puppy is None or not puppy.get("active", True):
            return False
        return bool(self._status().get("needs_attention"))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        data = dict(self._status())
        data.pop("needs_attention", None)
        return data

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATE, self._handle_update)
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_DASHBOARD_UPDATE,
                self._handle_dashboard_update,
            )
        )
        self.async_on_remove(
            async_track_time_interval(
                self.hass,
                self._periodic_update,
                REFRESH_INTERVAL,
            )
        )

    @callback
    def _handle_update(self, puppy_id: str | None = None) -> None:
        if puppy_id is None or puppy_id == self._puppy_id:
            self.async_write_ha_state()

    @callback
    def _handle_dashboard_update(self, *args: Any) -> None:
        self.async_write_ha_state()

    @callback
    def _periodic_update(self, now: datetime) -> None:
        self.async_write_ha_state()


class LitterAttentionBinarySensor(BinarySensorEntity):
    """Indicate whether an active puppy in a litter needs attention."""

    _attr_has_entity_name = True
    _attr_name = "Aandacht nodig"
    _attr_device_class = BinarySensorDeviceClass.PROBLEM
    _attr_icon = "mdi:alert-circle-outline"

    def __init__(
        self,
        storage: PuppyWeightStorage,
        litter_id: str,
    ) -> None:
        self.storage = storage
        self._litter_id = litter_id
        self._attr_unique_id = f"{litter_id}_attention"

    @property
    def litter(self) -> dict[str, Any] | None:
        return self.storage.get_litter(self._litter_id)

    @property
    def available(self) -> bool:
        return self.litter is not None

    @property
    def device_info(self) -> DeviceInfo:
        litter = self.litter or {}
        return DeviceInfo(
            identifiers={(DOMAIN, f"litter_{self._litter_id}")},
            name=litter.get("name", "Nest"),
            manufacturer="Puppy Weight Tracker",
            model="Litter/Nest",
        )

    def _attention(self) -> list[dict[str, Any]]:
        litter = self.litter or {}
        result: list[dict[str, Any]] = []
        for puppy_id, puppy in litter.get("puppies", {}).items():
            if not puppy.get("active", True):
                continue
            status = calculate_puppy_status(
                self.storage,
                self._litter_id,
                puppy_id,
            )
            if status.get("needs_attention"):
                result.append(
                    {
                        "puppy_id": puppy_id,
                        "name": puppy.get("name", "Puppy"),
                        "collar_color": puppy.get("collar_color"),
                        "status": status.get("status"),
                        "status_code": status.get("status_code"),
                    }
                )
        return result

    @property
    def is_on(self) -> bool:
        litter = self.litter
        if litter is None or not litter.get("active", True):
            return False
        return bool(self._attention())

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        attention = self._attention()
        return {
            "attention_count": len(attention),
            "puppies": attention,
        }

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_UPDATE, self._handle_update)
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_DASHBOARD_UPDATE,
                self._handle_dashboard_update,
            )
        )
        self.async_on_remove(
            async_track_time_interval(
                self.hass,
                self._periodic_update,
                REFRESH_INTERVAL,
            )
        )

    @callback
    def _handle_update(self, *args: Any) -> None:
        self.async_write_ha_state()

    @callback
    def _handle_dashboard_update(self, *args: Any) -> None:
        self.async_write_ha_state()

    @callback
    def _periodic_update(self, now: datetime) -> None:
        self.async_write_ha_state()
