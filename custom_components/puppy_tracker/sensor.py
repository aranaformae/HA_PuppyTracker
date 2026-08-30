"""Sensor platform for Puppy Tracker."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from dateutil.relativedelta import relativedelta

from homeassistant.components.sensor import (
    SensorDeviceClass,
    SensorEntity,
    SensorStateClass,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import UnitOfMass
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import (
    AddConfigEntryEntitiesCallback,
)
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_NEW_LITTER,
    SIGNAL_NEW_PUPPY,
    SIGNAL_UPDATE,
)
from .metrics import (
    calculate_puppy_status,
    current_weight,
    daily_growth_data,
    growth_since_birth_percent,
    last_weighed,
    previous_weight,
    weight_change,
)
from .runtime import PuppyTrackerRuntimeData
from .session import (
    SESSION_ACTIVE,
    SESSION_COMPLETED,
    get_session,
    remaining_puppy_ids,
)
from .storage import PuppyTrackerStorage

from .time_utils import parse_timestamp


TIME_REFRESH_INTERVAL = timedelta(
    minutes=30
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up Puppy Tracker sensors."""

    runtime = entry.runtime_data
    if not isinstance(runtime, PuppyTrackerRuntimeData):
        raise RuntimeError("Puppy Tracker runtime is unavailable")
    storage = runtime.storage

    known_puppies: set[str] = set()
    known_litters: set[str] = set()

    def create_entities_for_litter(
        litter_id: str,
    ) -> list[SensorEntity]:
        """Create all summary sensors for one litter."""

        known_litters.add(litter_id)

        return [
            LitterStatusSensor(hass, entry, litter_id),
            LitterActivePuppiesSensor(hass, entry, litter_id),
            LitterAttentionCountSensor(hass, entry, litter_id),
            LitterAverageWeightSensor(hass, entry, litter_id),
            LitterLightestPuppySensor(hass, entry, litter_id),
            LitterHeaviestPuppySensor(hass, entry, litter_id),
            LitterAverageGrowth24hPercentSensor(hass, entry, litter_id),
            LitterSessionProgressSensor(hass, entry, litter_id),
            LitterNextPuppySensor(hass, entry, litter_id),
            LitterLastCompletedSessionSensor(hass, entry, litter_id),
        ]

    def create_entities_for_puppy(
        litter_id: str,
        puppy_id: str,
    ) -> list[SensorEntity]:
        """Create all sensors for one puppy."""

        known_puppies.add(
            puppy_id
        )

        return [
            PuppyCurrentWeightSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppyBirthWeightSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppyPreviousWeightSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppyWeightChangeSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppyGrowthPercentSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppyGrowth24hSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppyGrowth24hPercentSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppyLastWeighedSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppyStatusSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppyCollarColorSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppySexSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppyBirthTimeSensor(
                storage,
                litter_id,
                puppy_id,
            ),
            PuppyAgeSensor(
                storage,
                litter_id,
                puppy_id,
            ),
        ]

    entities: list[SensorEntity] = [
        WeighingSessionStatusSensor(
            hass,
            entry,
        ),
        WeighingSessionProgressSensor(
            hass,
            entry,
        ),
        WeighingSessionRemainingSensor(
            hass,
            entry,
        ),
        WeighingSessionNextPuppySensor(
            hass,
            entry,
        ),
        WeighingSessionLastPuppySensor(
            hass,
            entry,
        ),
        WeighingSessionMessageSensor(
            hass,
            entry,
        ),
    ]

    for litter_id, litter in (
        storage.get_litters().items()
    ):
        entities.extend(
            create_entities_for_litter(
                litter_id
            )
        )

        for puppy_id in litter.get(
            "puppies",
            {},
        ):
            entities.extend(
                create_entities_for_puppy(
                    litter_id,
                    puppy_id,
                )
            )

    async_add_entities(
        entities
    )

    @callback
    def async_handle_new_litter(
        litter_id: str,
    ) -> None:
        """Create summary sensors for a newly added litter."""

        if litter_id in known_litters:
            return

        if storage.get_litter(litter_id) is None:
            return

        async_add_entities(
            create_entities_for_litter(
                litter_id
            )
        )

    entry.async_on_unload(
        async_dispatcher_connect(
            hass,
            SIGNAL_NEW_LITTER,
            async_handle_new_litter,
        )
    )

    @callback
    def async_handle_new_puppy(
        litter_id: str,
        puppy_id: str,
    ) -> None:
        """Create sensors for newly added puppy."""

        if puppy_id in known_puppies:
            return

        puppy = storage.get_puppy(
            litter_id,
            puppy_id,
        )

        if puppy is None:
            return

        async_add_entities(
            create_entities_for_puppy(
                litter_id,
                puppy_id,
            )
        )

    entry.async_on_unload(
        async_dispatcher_connect(
            hass,
            SIGNAL_NEW_PUPPY,
            async_handle_new_puppy,
        )
    )


class WeighingStationSensor(
    SensorEntity
):
    """Base sensor for weighing station."""

    _attr_has_entity_name = True

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
    ) -> None:
        """Initialize weighing station sensor."""

        self._hass = hass
        self._entry = entry

    @property
    def runtime(
        self,
    ) -> PuppyTrackerRuntimeData:
        """Return integration runtime."""

        runtime = self._entry.runtime_data
        if not isinstance(runtime, PuppyTrackerRuntimeData):
            raise RuntimeError("Puppy Tracker runtime is unavailable")
        return runtime

    @property
    def storage(
        self,
    ) -> PuppyTrackerStorage:
        """Return storage."""

        return self.runtime.storage

    @property
    def session(
        self,
    ) -> dict[str, Any]:
        """Return session."""

        return get_session(
            self.runtime
        )

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
                "Puppy Tracker"
            ),
            model="Weegstation",
        )

    async def async_added_to_hass(
        self,
    ) -> None:
        """Subscribe to dashboard updates."""

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
        """Refresh sensor."""

        self.async_write_ha_state()

    def _puppy_name(
        self,
        puppy_id: str | None,
    ) -> str | None:
        """Resolve puppy name."""

        if not puppy_id:
            return None

        litter_id = self.session.get(
            "litter_id"
        )

        if not litter_id:
            litter_id = self.runtime.selected_litter_id

        if not litter_id:
            return None

        puppy = self.storage.get_puppy(
            litter_id,
            puppy_id,
        )

        if puppy is None:
            return None

        name = puppy.get(
            "name",
            "Puppy",
        )

        collar = puppy.get(
            "collar_color"
        )

        if (
            collar
            and collar.lower()
            != name.lower()
        ):
            return (
                f"{name} ({collar})"
            )

        return name


class WeighingSessionStatusSensor(
    WeighingStationSensor
):
    """Weighing session status."""

    _attr_name = "Sessie"
    _attr_icon = "mdi:clipboard-check-outline"
    _attr_unique_id = (
        "puppy_tracker_session_status"
    )

    @property
    def native_value(
        self,
    ) -> str:
        """Return session status."""

        status = self.session.get(
            "status"
        )

        if status == SESSION_ACTIVE:
            return "Bezig"

        if status == SESSION_COMPLETED:
            return "Voltooid"

        return "Niet gestart"

    @property
    def extra_state_attributes(
        self,
    ) -> dict[str, Any]:
        """Return session metadata."""

        return {
            "started_at": self.session.get(
                "started_at"
            ),
            "completed_at": self.session.get(
                "completed_at"
            ),
            "total_puppies": len(
                self.session.get(
                    "puppy_ids",
                    [],
                )
            ),
            "weighed_puppies": len(
                self.session.get(
                    "weighed_puppy_ids",
                    [],
                )
            ),
        }


class WeighingSessionProgressSensor(
    WeighingStationSensor
):
    """Session progress."""

    _attr_name = "Voortgang"
    _attr_icon = "mdi:progress-check"
    _attr_unique_id = (
        "puppy_tracker_session_progress"
    )

    @property
    def native_value(
        self,
    ) -> str:
        """Return progress."""

        total = len(
            self.session.get(
                "puppy_ids",
                [],
            )
        )

        weighed = len(
            self.session.get(
                "weighed_puppy_ids",
                [],
            )
        )

        return (
            f"{weighed} / {total}"
        )

    @property
    def extra_state_attributes(
        self,
    ) -> dict[str, Any]:
        """Return numeric progress."""

        total = len(
            self.session.get(
                "puppy_ids",
                [],
            )
        )

        weighed = len(
            self.session.get(
                "weighed_puppy_ids",
                [],
            )
        )

        percent = (
            round(
                weighed / total * 100,
                1,
            )
            if total
            else 0.0
        )

        return {
            "weighed": weighed,
            "total": total,
            "percentage": percent,
        }


class WeighingSessionRemainingSensor(
    WeighingStationSensor
):
    """Puppies remaining."""

    _attr_name = "Nog te wegen"
    _attr_icon = "mdi:format-list-checks"
    _attr_unique_id = (
        "puppy_tracker_session_remaining"
    )

    @property
    def native_value(
        self,
    ) -> str:
        """Return remaining puppy names."""

        remaining = remaining_puppy_ids(
            self.session
        )

        if not remaining:
            return "Geen"

        names = [
            self._puppy_name(
                puppy_id
            )
            or "Puppy"
            for puppy_id in remaining
        ]

        return ", ".join(
            names
        )

    @property
    def extra_state_attributes(
        self,
    ) -> dict[str, Any]:
        """Return remaining count."""

        remaining = remaining_puppy_ids(
            self.session
        )

        return {
            "remaining": len(
                remaining
            )
        }


class WeighingSessionNextPuppySensor(
    WeighingStationSensor
):
    """Next puppy in session."""

    _attr_name = "Volgende pup"
    _attr_icon = "mdi:arrow-right-circle-outline"
    _attr_unique_id = (
        "puppy_tracker_session_next_puppy"
    )

    @property
    def native_value(
        self,
    ) -> str:
        """Return next puppy."""

        remaining = remaining_puppy_ids(
            self.session
        )

        if not remaining:
            return "Geen"

        return (
            self._puppy_name(
                remaining[0]
            )
            or "Puppy"
        )


class WeighingSessionLastPuppySensor(
    WeighingStationSensor
):
    """Last weighed puppy."""

    _attr_name = "Laatst gewogen pup"
    _attr_icon = "mdi:dog"
    _attr_unique_id = (
        "puppy_tracker_session_last_puppy"
    )

    @property
    def native_value(
        self,
    ) -> str:
        """Return last weighed puppy."""

        puppy_id = self.session.get(
            "last_puppy_id"
        )

        if not puppy_id:
            return "Geen"

        return (
            self._puppy_name(
                puppy_id
            )
            or "Puppy"
        )

    @property
    def extra_state_attributes(
        self,
    ) -> dict[str, Any]:
        """Return last weight."""

        return {
            "weight": self.session.get(
                "last_weight"
            ),
            "saved_at": self.session.get(
                "last_saved_at"
            ),
        }


class WeighingSessionMessageSensor(
    WeighingStationSensor
):
    """Last session message."""

    _attr_name = "Melding"
    _attr_icon = "mdi:message-text-outline"
    _attr_unique_id = (
        "puppy_tracker_session_message"
    )

    @property
    def native_value(
        self,
    ) -> str:
        """Return last session message."""

        return (
            self.session.get(
                "message"
            )
            or "Geen melding"
        )


class PuppyBaseSensor(
    SensorEntity
):
    """Base entity for puppy sensors."""

    _attr_has_entity_name = True

    def __init__(
        self,
        storage: PuppyTrackerStorage,
        litter_id: str,
        puppy_id: str,
        sensor_key: str,
    ) -> None:
        """Initialize puppy sensor."""

        self._storage = storage
        self._litter_id = litter_id
        self._puppy_id = puppy_id

        self._attr_unique_id = (
            f"{puppy_id}_{sensor_key}"
        )

    async def async_added_to_hass(
        self,
    ) -> None:
        """Subscribe to puppy updates."""

        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_UPDATE,
                self._handle_update,
            )
        )

    @callback
    def _handle_update(
        self,
        puppy_id: str | None = None,
    ) -> None:
        """Refresh when puppy data changes."""

        if (
            puppy_id is None
            or puppy_id == self._puppy_id
        ):
            self.async_write_ha_state()

    @property
    def puppy(
        self,
    ) -> dict[str, Any] | None:
        """Return current puppy."""

        return self._storage.get_puppy(
            self._litter_id,
            self._puppy_id,
        )

    @property
    def available(
        self,
    ) -> bool:
        """Return availability."""

        return self.puppy is not None

    @property
    def device_info(
        self,
    ) -> DeviceInfo:
        """Return puppy device."""

        puppy = self.puppy or {}

        return DeviceInfo(
            identifiers={
                (
                    DOMAIN,
                    f"puppy_{self._puppy_id}",
                )
            },
            name=puppy.get(
                "name",
                "Puppy",
            ),
            manufacturer=(
                "Puppy Tracker"
            ),
            model="Puppy",
        )

    def _birth_datetime(
        self,
    ) -> datetime | None:
        """Return birth datetime."""

        puppy = self.puppy
        if puppy is None:
            return None

        return parse_timestamp(puppy.get("birth_time"))

    def _daily_growth_data(
        self,
    ) -> dict[str, Any] | None:
        """Return canonical normalized 24-hour growth."""

        return daily_growth_data(
            self._storage,
            self._litter_id,
            self._puppy_id,
        )


class PuppyTimeAwareSensor(
    PuppyBaseSensor
):
    """Base time-dependent puppy sensor."""

    async def async_added_to_hass(
        self,
    ) -> None:
        """Subscribe and periodically update."""

        await super().async_added_to_hass()

        self.async_on_remove(
            async_track_time_interval(
                self.hass,
                self._periodic_update,
                TIME_REFRESH_INTERVAL,
            )
        )

    @callback
    def _periodic_update(
        self,
        now: datetime,
    ) -> None:
        """Refresh sensor."""

        self.async_write_ha_state()


class PuppyCurrentWeightSensor(
    PuppyBaseSensor
):
    """Current puppy weight."""

    _attr_name = "Gewicht"
    _attr_native_unit_of_measurement = UnitOfMass.GRAMS
    _attr_device_class = SensorDeviceClass.WEIGHT
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:scale"

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "weight",
        )

    @property
    def native_value(self):
        return current_weight(
            self._storage,
            self._litter_id,
            self._puppy_id,
        )


class PuppyBirthWeightSensor(
    PuppyBaseSensor
):
    """Birth weight."""

    _attr_name = "Geboortegewicht"
    _attr_native_unit_of_measurement = UnitOfMass.GRAMS
    _attr_device_class = SensorDeviceClass.WEIGHT
    _attr_icon = "mdi:baby-face-outline"

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "birth_weight",
        )

    @property
    def native_value(self):
        puppy = self.puppy

        if puppy is None:
            return None

        value = puppy.get(
            "birth_weight"
        )

        return (
            float(value)
            if value is not None
            else None
        )


class PuppyPreviousWeightSensor(
    PuppyBaseSensor
):
    """Previous weight."""

    _attr_name = "Vorig gewicht"
    _attr_native_unit_of_measurement = UnitOfMass.GRAMS
    _attr_device_class = SensorDeviceClass.WEIGHT
    _attr_icon = "mdi:history"

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "previous_weight",
        )

    @property
    def native_value(self):
        return previous_weight(
            self._storage,
            self._litter_id,
            self._puppy_id,
        )


class PuppyWeightChangeSensor(
    PuppyBaseSensor
):
    """Latest weight difference."""

    _attr_name = "Verschil laatste meting"
    _attr_native_unit_of_measurement = UnitOfMass.GRAMS
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:delta"

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "weight_change",
        )

    @property
    def native_value(self):
        return weight_change(
            self._storage,
            self._litter_id,
            self._puppy_id,
        )


class PuppyGrowthPercentSensor(
    PuppyBaseSensor
):
    """Growth since birth."""

    _attr_name = "Groei sinds geboorte"
    _attr_native_unit_of_measurement = "%"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:percent"

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "growth_percentage",
        )

    @property
    def native_value(self):
        return growth_since_birth_percent(
            self._storage,
            self._litter_id,
            self._puppy_id,
        )


class PuppyGrowth24hSensor(
    PuppyBaseSensor
):
    """Normalized 24-hour growth."""

    _attr_name = "Groei 24 uur"
    _attr_native_unit_of_measurement = UnitOfMass.GRAMS
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:chart-line"

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "growth_24h",
        )

    @property
    def native_value(self):
        data = self._daily_growth_data()

        if data is None:
            return None

        return data[
            "daily_change_grams"
        ]

    @property
    def extra_state_attributes(self):
        data = self._daily_growth_data()

        if data is None:
            return None

        return data


class PuppyGrowth24hPercentSensor(
    PuppyBaseSensor
):
    """Normalized 24-hour percentage growth."""

    _attr_name = "Groei 24 uur procent"
    _attr_native_unit_of_measurement = "%"
    _attr_state_class = SensorStateClass.MEASUREMENT
    _attr_icon = "mdi:percent"

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "growth_24h_percent",
        )

    @property
    def native_value(self):
        data = self._daily_growth_data()

        if data is None:
            return None

        return data[
            "daily_change_percent"
        ]

    @property
    def extra_state_attributes(self):
        data = self._daily_growth_data()

        if data is None:
            return None

        return data


class PuppyLastWeighedSensor(
    PuppyBaseSensor
):
    """Last weighing timestamp."""

    _attr_name = "Laatste weging"
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_icon = "mdi:clock-outline"

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "last_weighed",
        )

    @property
    def native_value(self):
        return last_weighed(
            self._storage,
            self._litter_id,
            self._puppy_id,
        )


class PuppyStatusSensor(
    PuppyTimeAwareSensor
):
    """Puppy monitoring status."""

    _attr_name = "Status"
    _attr_icon = "mdi:heart-pulse"

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "status",
        )

    def _status_data(self) -> dict[str, Any]:
        """Return canonical monitoring status."""

        return calculate_puppy_status(
            self._storage,
            self._litter_id,
            self._puppy_id,
        )

    @property
    def native_value(self):
        return self._status_data()[
            "status"
        ]

    @property
    def extra_state_attributes(self):
        data = self._status_data()

        data.pop(
            "status",
            None,
        )

        return data


class PuppyCollarColorSensor(
    PuppyBaseSensor
):
    """Collar color."""

    _attr_name = "Halsbandkleur"
    _attr_icon = "mdi:tag-outline"
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "collar_color",
        )

    @property
    def native_value(self):
        puppy = self.puppy

        if puppy is None:
            return None

        return puppy.get(
            "collar_color"
        )


class PuppySexSensor(
    PuppyBaseSensor
):
    """Sex."""

    _attr_name = "Geslacht"
    _attr_icon = "mdi:gender-male-female"
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "sex",
        )

    @property
    def native_value(self):
        puppy = self.puppy

        if puppy is None:
            return None

        sex = puppy.get(
            "sex"
        )

        if sex == "male":
            return "Reu"

        if sex == "female":
            return "Teef"

        return None


class PuppyBirthTimeSensor(
    PuppyBaseSensor
):
    """Birth date and time."""

    _attr_name = "Geboortedatum en tijd"
    _attr_device_class = SensorDeviceClass.TIMESTAMP
    _attr_icon = "mdi:calendar-clock"
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "birth_time",
        )

    @property
    def native_value(self):
        return self._birth_datetime()


class PuppyAgeSensor(
    PuppyTimeAwareSensor
):
    """Human-readable puppy age."""

    _attr_name = "Leeftijd"
    _attr_icon = "mdi:timer-sand"

    def __init__(
        self,
        storage,
        litter_id,
        puppy_id,
    ) -> None:
        super().__init__(
            storage,
            litter_id,
            puppy_id,
            "age",
        )

    def _age_data(self):
        birth = self._birth_datetime()

        if birth is None:
            return None

        now = dt_util.now()

        if birth > now:
            return {
                "birth_time": birth.isoformat(),
                "born": False,
                "age_hours": 0,
                "age_days": 0,
                "age_weeks": 0,
                "age_months": 0,
                "age_years": 0,
                "calendar_months": 0,
                "calendar_days": 0,
                "calendar_hours": 0,
            }

        delta = now - birth

        calendar_age = relativedelta(
            now,
            birth,
        )

        total_hours = int(
            delta.total_seconds()
            // 3600
        )

        total_days = delta.days

        return {
            "birth_time": birth.isoformat(),
            "born": True,
            "age_hours": total_hours,
            "age_days": total_days,
            "age_weeks": (
                total_days // 7
            ),
            "age_months": (
                calendar_age.years * 12
                + calendar_age.months
            ),
            "age_years": calendar_age.years,
            "calendar_months": calendar_age.months,
            "calendar_days": calendar_age.days,
            "calendar_hours": calendar_age.hours,
        }

    @property
    def extra_state_attributes(self):
        return self._age_data()

    @property
    def native_value(self):
        birth = self._birth_datetime()

        if birth is None:
            return None

        now = dt_util.now()

        if birth > now:
            return "Nog niet geboren"

        delta = now - birth

        total_hours = int(
            delta.total_seconds()
            // 3600
        )

        total_days = delta.days

        if total_days < 7:
            days = (
                total_hours // 24
            )

            hours = (
                total_hours % 24
            )

            if days == 0:
                return (
                    f"{hours} uur"
                )

            if hours == 0:
                return (
                    f"{days} "
                    f"{'dag' if days == 1 else 'dagen'}"
                )

            return (
                f"{days} "
                f"{'dag' if days == 1 else 'dagen'} "
                f"{hours} uur"
            )

        if total_days < 28:
            return (
                f"{total_days} dagen"
            )

        calendar_age = relativedelta(
            now,
            birth,
        )

        total_months = (
            calendar_age.years * 12
            + calendar_age.months
        )

        if total_months < 3:
            weeks = (
                total_days // 7
            )

            return (
                f"{weeks} "
                f"{'week' if weeks == 1 else 'weken'}"
            )

        if total_months < 24:
            return (
                f"{total_months} "
                f"{'maand' if total_months == 1 else 'maanden'}"
            )

        years = calendar_age.years
        months = calendar_age.months

        if months == 0:
            return (
                f"{years} jaar"
            )

        return (
            f"{years} jaar "
            f"{months} "
            f"{'maand' if months == 1 else 'maanden'}"
        )

class LitterBaseSensor(SensorEntity):
    """Base entity for litter summary sensors."""

    _attr_has_entity_name = True

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        litter_id: str,
        sensor_key: str,
    ) -> None:
        """Initialize litter summary sensor."""

        self._hass = hass
        self._entry = entry
        self._litter_id = litter_id
        self._attr_unique_id = f"{litter_id}_{sensor_key}"

    @property
    def runtime(self) -> PuppyTrackerRuntimeData:
        """Return integration runtime."""

        runtime = self._entry.runtime_data
        if not isinstance(runtime, PuppyTrackerRuntimeData):
            raise RuntimeError("Puppy Tracker runtime is unavailable")
        return runtime

    @property
    def storage(self) -> PuppyTrackerStorage:
        """Return persistent storage."""

        return self.runtime.storage

    @property
    def litter(self) -> dict[str, Any] | None:
        """Return the current litter."""

        return self.storage.get_litter(self._litter_id)

    @property
    def available(self) -> bool:
        """Return whether the litter still exists."""

        return self.litter is not None

    @property
    def device_info(self) -> DeviceInfo:
        """Return litter device information."""

        litter = self.litter or {}
        return DeviceInfo(
            identifiers={(DOMAIN, f"litter_{self._litter_id}")},
            name=litter.get("name", "Nest"),
            manufacturer="Puppy Tracker",
            model="Nest",
        )

    async def async_added_to_hass(self) -> None:
        """Subscribe to integration updates."""

        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_UPDATE,
                self._handle_update,
            )
        )
        self.async_on_remove(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_DASHBOARD_UPDATE,
                self._handle_update,
            )
        )
        self.async_on_remove(
            async_track_time_interval(
                self.hass,
                self._periodic_update,
                TIME_REFRESH_INTERVAL,
            )
        )

    @callback
    def _periodic_update(self, now: datetime) -> None:
        """Refresh time-sensitive litter summaries."""

        self.async_write_ha_state()

    @callback
    def _handle_update(self, *args: Any) -> None:
        """Refresh summary state."""

        self.async_write_ha_state()

    def _active_puppies(self) -> dict[str, dict[str, Any]]:
        """Return active puppies for this litter."""

        litter = self.litter or {}
        return {
            puppy_id: puppy
            for puppy_id, puppy in litter.get("puppies", {}).items()
            if puppy.get("active", True)
        }

    def _current_weight(self, puppy_id: str) -> float | None:
        """Return latest active weight for a puppy."""

        return current_weight(
            self.storage,
            self._litter_id,
            puppy_id,
        )

    def _weighted_puppies(self) -> list[tuple[str, dict[str, Any], float]]:
        """Return active puppies that have a current weight."""

        result: list[tuple[str, dict[str, Any], float]] = []
        for puppy_id, puppy in self._active_puppies().items():
            weight = self._current_weight(puppy_id)
            if weight is None:
                continue
            result.append((puppy_id, puppy, weight))
        return result

    def _attention_puppies(self) -> list[tuple[str, dict[str, Any], dict[str, Any]]]:
        """Return active puppies whose monitoring status needs attention."""

        result: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
        for puppy_id, puppy in self._active_puppies().items():
            status = calculate_puppy_status(
                self.storage,
                self._litter_id,
                puppy_id,
            )
            if status.get("needs_attention"):
                result.append((puppy_id, puppy, status))
        return result

    def _session_for_litter(self) -> dict[str, Any] | None:
        """Return current runtime session when it belongs to this litter."""

        session = get_session(self.runtime)
        if session.get("litter_id") != self._litter_id:
            return None
        return session

    @staticmethod
    def _puppy_label(puppy: dict[str, Any]) -> str:
        """Return a useful puppy display label."""

        name = puppy.get("name") or "Puppy"
        collar = puppy.get("collar_color")
        if collar and str(collar).lower() != str(name).lower():
            return f"{name} ({collar})"
        return str(name)


class LitterStatusSensor(LitterBaseSensor):
    """Overall litter monitoring status."""

    _attr_name = "Neststatus"
    _attr_icon = "mdi:heart-pulse"

    def __init__(self, hass, entry, litter_id) -> None:
        super().__init__(hass, entry, litter_id, "status")

    @property
    def native_value(self) -> str:
        active = self._active_puppies()
        if not active:
            return "Geen actieve pups"

        attention = self._attention_puppies()
        if attention:
            return f"Aandacht ({len(attention)})"
        return "OK"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        attention = self._attention_puppies()
        return {
            "active_puppies": len(self._active_puppies()),
            "attention_count": len(attention),
            "attention_puppies": [
                self._puppy_label(puppy)
                for _puppy_id, puppy, _status in attention
            ],
            "attention_reasons": {
                self._puppy_label(puppy): status.get("status")
                for _puppy_id, puppy, status in attention
            },
        }


class LitterActivePuppiesSensor(LitterBaseSensor):
    """Number of active puppies."""

    _attr_name = "Actieve pups"
    _attr_icon = "mdi:dog-side"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, hass, entry, litter_id) -> None:
        super().__init__(hass, entry, litter_id, "active_puppies")

    @property
    def native_value(self) -> int:
        return len(self._active_puppies())


class LitterAttentionCountSensor(LitterBaseSensor):
    """Number of puppies needing attention."""

    _attr_name = "Aandacht nodig"
    _attr_icon = "mdi:alert-circle-outline"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, hass, entry, litter_id) -> None:
        super().__init__(hass, entry, litter_id, "attention_count")

    @property
    def native_value(self) -> int:
        return len(self._attention_puppies())

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        attention = self._attention_puppies()
        return {
            "puppies": [
                self._puppy_label(puppy)
                for _puppy_id, puppy, _status in attention
            ],
            "reasons": {
                self._puppy_label(puppy): status.get("status")
                for _puppy_id, puppy, status in attention
            },
        }


class LitterAverageWeightSensor(LitterBaseSensor):
    """Average current weight for active puppies."""

    _attr_name = "Gemiddeld gewicht"
    _attr_icon = "mdi:scale-balance"
    _attr_native_unit_of_measurement = UnitOfMass.GRAMS
    _attr_device_class = SensorDeviceClass.WEIGHT
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, hass, entry, litter_id) -> None:
        super().__init__(hass, entry, litter_id, "average_weight")

    @property
    def native_value(self) -> float | None:
        weighted = self._weighted_puppies()
        if not weighted:
            return None
        return round(sum(item[2] for item in weighted) / len(weighted), 1)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        return {
            "puppies_with_weight": len(self._weighted_puppies()),
            "active_puppies": len(self._active_puppies()),
        }


class _LitterExtremeWeightSensor(LitterBaseSensor):
    """Base class for lightest/heaviest puppy."""

    _choose_heaviest = False

    def _selected(self) -> tuple[str, dict[str, Any], float] | None:
        weighted = self._weighted_puppies()
        if not weighted:
            return None
        return max(weighted, key=lambda item: item[2]) if self._choose_heaviest else min(weighted, key=lambda item: item[2])

    @property
    def native_value(self) -> str | None:
        selected = self._selected()
        if selected is None:
            return None
        return self._puppy_label(selected[1])

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        selected = self._selected()
        if selected is None:
            return {}
        puppy_id, puppy, weight = selected
        return {
            "puppy_id": puppy_id,
            "puppy_name": puppy.get("name"),
            "collar_color": puppy.get("collar_color"),
            "weight": weight,
            "unit": UnitOfMass.GRAMS,
        }


class LitterLightestPuppySensor(_LitterExtremeWeightSensor):
    """Lightest active puppy."""

    _attr_name = "Lichtste pup"
    _attr_icon = "mdi:arrow-down-bold-circle-outline"

    def __init__(self, hass, entry, litter_id) -> None:
        super().__init__(hass, entry, litter_id, "lightest_puppy")


class LitterHeaviestPuppySensor(_LitterExtremeWeightSensor):
    """Heaviest active puppy."""

    _attr_name = "Zwaarste pup"
    _attr_icon = "mdi:arrow-up-bold-circle-outline"
    _choose_heaviest = True

    def __init__(self, hass, entry, litter_id) -> None:
        super().__init__(hass, entry, litter_id, "heaviest_puppy")


class LitterAverageGrowth24hPercentSensor(LitterBaseSensor):
    """Average normalized 24-hour growth percentage."""

    _attr_name = "Gemiddelde groei 24 uur"
    _attr_icon = "mdi:chart-line"
    _attr_native_unit_of_measurement = "%"
    _attr_state_class = SensorStateClass.MEASUREMENT

    def __init__(self, hass, entry, litter_id) -> None:
        super().__init__(hass, entry, litter_id, "average_growth_24h_percent")

    def _values(self) -> list[tuple[str, dict[str, Any], float]]:
        values: list[tuple[str, dict[str, Any], float]] = []
        for puppy_id, puppy in self._active_puppies().items():
            growth = daily_growth_data(
                self.storage,
                self._litter_id,
                puppy_id,
            )
            if growth is None:
                continue
            values.append((puppy_id, puppy, float(growth["daily_change_percent"])))
        return values

    @property
    def native_value(self) -> float | None:
        values = self._values()
        if not values:
            return None
        return round(sum(item[2] for item in values) / len(values), 2)

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        values = self._values()
        return {
            "puppies_with_growth_sample": len(values),
            "active_puppies": len(self._active_puppies()),
            "per_puppy": {
                self._puppy_label(puppy): value
                for _puppy_id, puppy, value in values
            },
        }


class LitterSessionProgressSensor(LitterBaseSensor):
    """Current weighing-session progress for this litter."""

    _attr_name = "Weegsessie voortgang"
    _attr_icon = "mdi:progress-check"

    def __init__(self, hass, entry, litter_id) -> None:
        super().__init__(hass, entry, litter_id, "session_progress")

    @property
    def native_value(self) -> str:
        session = self._session_for_litter()
        if session is None:
            return "Niet actief"
        total = len(session.get("puppy_ids", []))
        weighed = len(session.get("weighed_puppy_ids", []))
        return f"{weighed} / {total}"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        session = self._session_for_litter()
        if session is None:
            return {
                "status": "idle",
                "weighed": 0,
                "total": 0,
                "percentage": 0.0,
            }
        total = len(session.get("puppy_ids", []))
        weighed = len(session.get("weighed_puppy_ids", []))
        return {
            "status": session.get("status"),
            "weighed": weighed,
            "total": total,
            "percentage": round(weighed / total * 100, 1) if total else 0.0,
            "started_at": session.get("started_at"),
            "completed_at": session.get("completed_at"),
        }


class LitterNextPuppySensor(LitterBaseSensor):
    """Next puppy in this litter's active weighing session."""

    _attr_name = "Volgende pup"
    _attr_icon = "mdi:arrow-right-circle-outline"

    def __init__(self, hass, entry, litter_id) -> None:
        super().__init__(hass, entry, litter_id, "next_puppy")

    @property
    def native_value(self) -> str:
        session = self._session_for_litter()
        if session is None or session.get("status") != SESSION_ACTIVE:
            return "Geen"
        remaining = remaining_puppy_ids(session)
        if not remaining:
            return "Geen"
        puppy = self.storage.get_puppy(self._litter_id, remaining[0])
        if puppy is None:
            return "Onbekend"
        return self._puppy_label(puppy)


class LitterLastCompletedSessionSensor(LitterBaseSensor):
    """Timestamp of the last fully completed weighing session."""

    _attr_name = "Laatste volledige weegsessie"
    _attr_icon = "mdi:clipboard-check-outline"
    _attr_device_class = SensorDeviceClass.TIMESTAMP

    def __init__(self, hass, entry, litter_id) -> None:
        super().__init__(hass, entry, litter_id, "last_completed_session")

    @property
    def native_value(self) -> datetime | None:
        litter = self.litter or {}
        session = litter.get("last_completed_session")
        if not isinstance(session, dict):
            return None
        return parse_timestamp(session.get("completed_at"))

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        litter = self.litter or {}
        session = litter.get("last_completed_session")
        if not isinstance(session, dict):
            return {}
        return {
            "started_at": session.get("started_at"),
            "completed_at": session.get("completed_at"),
            "weighed": session.get("weighed_puppies"),
            "total": session.get("total_puppies"),
            "puppy_ids": session.get("puppy_ids", []),
        }
