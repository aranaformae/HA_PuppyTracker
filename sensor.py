"""Sensor platform for Puppy Weight Tracker."""

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
    DEFAULT_GROWTH_MONITORING_DAYS,
    DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
    DEFAULT_MIN_DAILY_GROWTH_PERCENT,
    DOMAIN,
    FIRST_DAY_GRACE_HOURS,
    FIRST_DAY_MAX_WEIGHT_LOSS_PERCENT,
    MIN_GROWTH_SAMPLE_HOURS,
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_NEW_PUPPY,
    SIGNAL_UPDATE,
)
from .session import (
    SESSION_ACTIVE,
    SESSION_COMPLETED,
    get_session,
    remaining_puppy_ids,
)
from .storage import PuppyWeightStorage


TIME_REFRESH_INTERVAL = timedelta(
    minutes=30
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up Puppy Weight Tracker sensors."""

    storage: PuppyWeightStorage = hass.data[
        DOMAIN
    ][
        entry.entry_id
    ][
        "storage"
    ]

    known_puppies: set[str] = set()

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
    ) -> dict[str, Any]:
        """Return integration runtime."""

        return self._hass.data[
            DOMAIN
        ][
            self._entry.entry_id
        ]

    @property
    def storage(
        self,
    ) -> PuppyWeightStorage:
        """Return storage."""

        return self.runtime[
            "storage"
        ]

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
                "Puppy Weight Tracker"
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
            litter_id = self.runtime.get(
                "selected_litter_id"
            )

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
        "puppy_weight_tracker_session_status"
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
        "puppy_weight_tracker_session_progress"
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
        "puppy_weight_tracker_session_remaining"
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
        "puppy_weight_tracker_session_next_puppy"
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
        "puppy_weight_tracker_session_last_puppy"
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
        "puppy_weight_tracker_session_message"
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
        storage: PuppyWeightStorage,
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
                "Puppy Weight Tracker"
            ),
            model="Puppy",
        )

    def _settings(
        self,
    ) -> dict[str, Any]:
        """Return monitoring settings."""

        return self._storage.get_settings()

    def _active_measurements(
        self,
    ) -> list[dict[str, Any]]:
        """Return active measurements."""

        if self.puppy is None:
            return []

        try:
            measurements = (
                self._storage.get_active_measurements(
                    self._litter_id,
                    self._puppy_id,
                )
            )
        except ValueError:
            return []

        return sorted(
            measurements,
            key=lambda measurement: (
                measurement.get(
                    "timestamp",
                    "",
                )
            ),
        )

    @staticmethod
    def _parse_timestamp(
        timestamp: str | None,
    ) -> datetime | None:
        """Parse ISO timestamp."""

        if not timestamp:
            return None

        try:
            result = datetime.fromisoformat(
                timestamp
            )
        except ValueError:
            return None

        if result.tzinfo is None:
            result = result.replace(
                tzinfo=(
                    dt_util.DEFAULT_TIME_ZONE
                )
            )

        return result

    def _birth_datetime(
        self,
    ) -> datetime | None:
        """Return birth datetime."""

        puppy = self.puppy

        if puppy is None:
            return None

        return self._parse_timestamp(
            puppy.get(
                "birth_time"
            )
        )

    def _measurement_series(
        self,
    ) -> list[
        tuple[
            datetime,
            dict[str, Any],
        ]
    ]:
        """Return parsed measurement series."""

        result = []

        for measurement in (
            self._active_measurements()
        ):
            measured_at = (
                self._parse_timestamp(
                    measurement.get(
                        "timestamp"
                    )
                )
            )

            if measured_at is None:
                continue

            result.append(
                (
                    measured_at,
                    measurement,
                )
            )

        result.sort(
            key=lambda item: item[0]
        )

        return result

    def _daily_growth_data(
        self,
    ) -> dict[str, Any] | None:
        """Calculate normalized growth over 24 hours."""

        series = self._measurement_series()

        if len(series) < 2:
            return None

        latest_time, latest = series[-1]

        target_time = (
            latest_time
            - timedelta(
                hours=24
            )
        )

        candidates = []

        for (
            measured_at,
            measurement,
        ) in series[:-1]:
            interval_hours = (
                latest_time
                - measured_at
            ).total_seconds() / 3600

            if (
                interval_hours
                < MIN_GROWTH_SAMPLE_HOURS
            ):
                continue

            distance = abs(
                (
                    measured_at
                    - target_time
                ).total_seconds()
            )

            candidates.append(
                (
                    distance,
                    interval_hours,
                    measured_at,
                    measurement,
                )
            )

        if not candidates:
            return None

        candidates.sort(
            key=lambda item: item[0]
        )

        (
            _distance,
            interval_hours,
            baseline_time,
            baseline,
        ) = candidates[0]

        baseline_weight = float(
            baseline["weight"]
        )

        latest_weight = float(
            latest["weight"]
        )

        if baseline_weight <= 0:
            return None

        actual_change = (
            latest_weight
            - baseline_weight
        )

        factor = (
            24.0
            / interval_hours
        )

        daily_change = (
            actual_change
            * factor
        )

        actual_percent = (
            actual_change
            / baseline_weight
            * 100
        )

        daily_percent = (
            actual_percent
            * factor
        )

        return {
            "daily_change_grams": round(
                daily_change,
                1,
            ),
            "daily_change_percent": round(
                daily_percent,
                2,
            ),
            "actual_change_grams": round(
                actual_change,
                1,
            ),
            "sample_interval_hours": round(
                interval_hours,
                2,
            ),
            "baseline_weight": baseline_weight,
            "current_weight": latest_weight,
            "baseline_time": (
                baseline_time.isoformat()
            ),
            "latest_time": (
                latest_time.isoformat()
            ),
        }


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
        measurements = self._active_measurements()

        if not measurements:
            return None

        return float(
            measurements[-1]["weight"]
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
        measurements = self._active_measurements()

        if len(measurements) < 2:
            return None

        return float(
            measurements[-2]["weight"]
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
        measurements = self._active_measurements()

        if len(measurements) < 2:
            return None

        return round(
            float(
                measurements[-1]["weight"]
            )
            - float(
                measurements[-2]["weight"]
            ),
            1,
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
        puppy = self.puppy

        if puppy is None:
            return None

        birth_weight = puppy.get(
            "birth_weight"
        )

        if not birth_weight:
            return None

        measurements = self._active_measurements()

        if not measurements:
            return None

        current = float(
            measurements[-1]["weight"]
        )

        return round(
            (
                (
                    current
                    - float(
                        birth_weight
                    )
                )
                / float(
                    birth_weight
                )
            )
            * 100,
            2,
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
        series = self._measurement_series()

        if not series:
            return None

        return series[-1][0]


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

    def _status_data(self):
        settings = self._settings()

        min_growth = float(
            settings.get(
                "min_daily_growth_percent",
                DEFAULT_MIN_DAILY_GROWTH_PERCENT,
            )
        )

        max_hours = float(
            settings.get(
                "max_hours_between_weighings",
                DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
            )
        )

        monitoring_days = int(
            settings.get(
                "growth_monitoring_days",
                DEFAULT_GROWTH_MONITORING_DAYS,
            )
        )

        result = {
            "status": "Geen meting",
            "status_code": "no_measurement",
            "needs_attention": True,
            "weight_loss": False,
            "hours_since_weighing": None,
            "daily_growth_percent": None,
            "daily_growth_grams": None,
            "daily_growth_sample_hours": None,
            "first_day_weight_change_percent": None,
            "growth_check_active": False,
            "min_daily_growth_percent": min_growth,
            "max_hours_between_weighings": max_hours,
            "growth_monitoring_days": monitoring_days,
        }

        series = self._measurement_series()

        if not series:
            return result

        latest_time, latest = series[-1]

        now = dt_util.now()

        hours_since = max(
            0,
            (
                now
                - latest_time
            ).total_seconds()
            / 3600,
        )

        result[
            "hours_since_weighing"
        ] = round(
            hours_since,
            1,
        )

        growth = self._daily_growth_data()

        if growth is not None:
            result[
                "daily_growth_percent"
            ] = growth[
                "daily_change_percent"
            ]

            result[
                "daily_growth_grams"
            ] = growth[
                "daily_change_grams"
            ]

            result[
                "daily_growth_sample_hours"
            ] = growth[
                "sample_interval_hours"
            ]

        birth = self._birth_datetime()

        age_hours = (
            (
                now
                - birth
            ).total_seconds()
            / 3600
            if birth is not None
            else None
        )

        current_weight = float(
            latest["weight"]
        )

        puppy = self.puppy or {}

        birth_weight_raw = puppy.get(
            "birth_weight"
        )

        birth_weight = (
            float(
                birth_weight_raw
            )
            if birth_weight_raw
            else None
        )

        if hours_since >= max_hours:
            result.update(
                {
                    "status": "Wegen",
                    "status_code": "weigh_due",
                    "needs_attention": True,
                }
            )

            return result

        if (
            age_hours is not None
            and 0
            <= age_hours
            < FIRST_DAY_GRACE_HOURS
        ):
            if (
                birth_weight is not None
                and birth_weight > 0
            ):
                change = (
                    (
                        current_weight
                        - birth_weight
                    )
                    / birth_weight
                    * 100
                )

                result[
                    "first_day_weight_change_percent"
                ] = round(
                    change,
                    2,
                )

                if (
                    change
                    < -FIRST_DAY_MAX_WEIGHT_LOSS_PERCENT
                ):
                    result.update(
                        {
                            "status": "Aandacht",
                            "status_code": (
                                "first_day_excess_weight_loss"
                            ),
                            "needs_attention": True,
                            "weight_loss": True,
                        }
                    )

                    return result

            result.update(
                {
                    "status": "Eerste 24 uur",
                    "status_code": "first_24h",
                    "needs_attention": False,
                }
            )

            return result

        measurements = self._active_measurements()

        if len(measurements) >= 2:
            previous = float(
                measurements[-2]["weight"]
            )

            if current_weight < previous:
                result.update(
                    {
                        "status": "Gewichtsverlies",
                        "status_code": "weight_loss",
                        "needs_attention": True,
                        "weight_loss": True,
                    }
                )

                return result

        if (
            age_hours is not None
            and age_hours >= FIRST_DAY_GRACE_HOURS
            and age_hours
            <= monitoring_days * 24
        ):
            result[
                "growth_check_active"
            ] = True

            if (
                growth is not None
                and growth[
                    "daily_change_percent"
                ]
                < min_growth
            ):
                result.update(
                    {
                        "status": "Lage groei",
                        "status_code": "low_growth",
                        "needs_attention": True,
                    }
                )

                return result

        result.update(
            {
                "status": "OK",
                "status_code": "ok",
                "needs_attention": False,
            }
        )

        return result

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