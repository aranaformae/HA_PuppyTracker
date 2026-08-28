"""Button entities for Puppy Weight Tracker."""

from __future__ import annotations

from datetime import datetime
import logging
from typing import Any

from homeassistant.components.button import ButtonEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.entity_platform import (
    AddConfigEntryEntitiesCallback,
)
from homeassistant.util import dt as dt_util

from .const import (
    DOMAIN,
    DUPLICATE_CONFIRMATION_SECONDS,
    DUPLICATE_WEIGHING_WINDOW_SECONDS,
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_UPDATE,
)
from .session import (
    SESSION_ACTIVE,
    get_session,
    mark_weight_recorded,
    reset_weighing_session,
    start_weighing_session,
)


_LOGGER = logging.getLogger(__name__)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up weighing station buttons."""

    async_add_entities(
        [
            PuppyStartSessionButton(
                hass,
                entry,
            ),
            PuppySaveWeightButton(
                hass,
                entry,
            ),
            PuppyResetSessionButton(
                hass,
                entry,
            ),
        ]
    )


class PuppyWeighingButtonBase(
    ButtonEntity
):
    """Base weighing station button."""

    _attr_has_entity_name = True

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
    ) -> None:
        """Initialize button."""

        self._hass = hass
        self._entry = entry

    @property
    def data(
        self,
    ) -> dict[str, Any]:
        """Return runtime data."""

        return self._hass.data[
            DOMAIN
        ][
            self._entry.entry_id
        ]

    @property
    def storage(
        self,
    ):
        """Return persistent storage."""

        return self.data[
            "storage"
        ]

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


class PuppyStartSessionButton(
    PuppyWeighingButtonBase
):
    """Start a litter weighing session."""

    _attr_name = "Weegsessie starten"
    _attr_icon = "mdi:play-circle"
    _attr_unique_id = (
        "puppy_weight_tracker_start_session"
    )

    async def async_press(
        self,
    ) -> None:
        """Start weighing session."""

        session = get_session(
            self.data
        )

        if (
            session.get("status")
            == SESSION_ACTIVE
        ):
            raise HomeAssistantError(
                "Er is al een actieve weegsessie. "
                "Rond deze af of reset hem eerst."
            )

        active_litters = {
            litter_id: litter
            for litter_id, litter
            in self.storage.get_litters().items()
            if litter.get(
                "active",
                True,
            )
        }

        if not active_litters:
            raise HomeAssistantError(
                "Er zijn geen actieve nesten."
            )

        litter_id = self.data.get(
            "selected_litter_id"
        )

        if litter_id not in active_litters:
            litter_id = next(
                iter(
                    active_litters
                )
            )

        litter = active_litters[
            litter_id
        ]

        puppy_ids = [
            puppy_id
            for puppy_id, puppy
            in litter.get(
                "puppies",
                {},
            ).items()
            if puppy.get(
                "active",
                True,
            )
        ]

        if not puppy_ids:
            raise HomeAssistantError(
                "Dit nest bevat geen actieve puppy's."
            )

        start_weighing_session(
            self.data,
            litter_id,
            puppy_ids,
        )

        async_dispatcher_send(
            self.hass,
            SIGNAL_DASHBOARD_UPDATE,
        )

        _LOGGER.info(
            "Started weighing session for litter '%s' "
            "with %d puppies",
            litter.get(
                "name",
                litter_id,
            ),
            len(
                puppy_ids
            ),
        )


class PuppySaveWeightButton(
    PuppyWeighingButtonBase
):
    """Save dashboard weight."""

    _attr_name = "Gewicht opslaan"
    _attr_icon = "mdi:content-save"
    _attr_unique_id = (
        "puppy_weight_tracker_save_weight"
    )

    @staticmethod
    def _parse_datetime(
        value: str | None,
    ) -> datetime | None:
        """Parse stored ISO timestamp."""

        if not value:
            return None

        try:
            result = datetime.fromisoformat(
                value
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

    def _has_recent_dashboard_measurement(
        self,
        litter_id: str,
        puppy_id: str,
    ) -> bool:
        """Check for a very recent dashboard measurement."""

        try:
            measurements = (
                self.storage.get_active_measurements(
                    litter_id,
                    puppy_id,
                )
            )
        except ValueError:
            return False

        if not measurements:
            return False

        latest = max(
            measurements,
            key=lambda item: (
                item.get(
                    "created_at",
                    "",
                )
            ),
        )

        if (
            latest.get("note")
            != "Dashboardweging"
        ):
            return False

        created_at = (
            self._parse_datetime(
                latest.get(
                    "created_at"
                )
            )
        )

        if created_at is None:
            return False

        age_seconds = (
            dt_util.now()
            - created_at
        ).total_seconds()

        return (
            0
            <= age_seconds
            <= DUPLICATE_WEIGHING_WINDOW_SECONDS
        )

    def _duplicate_is_confirmed(
        self,
        puppy_id: str,
        weight: float,
    ) -> bool:
        """Check whether second press confirms duplicate."""

        session = get_session(
            self.data
        )

        pending = session.get(
            "duplicate_pending"
        )

        if not isinstance(
            pending,
            dict,
        ):
            return False

        expires_at = (
            self._parse_datetime(
                pending.get(
                    "expires_at"
                )
            )
        )

        if expires_at is None:
            session[
                "duplicate_pending"
            ] = None

            return False

        if dt_util.now() > expires_at:
            session[
                "duplicate_pending"
            ] = None

            return False

        return (
            pending.get(
                "puppy_id"
            )
            == puppy_id
            and float(
                pending.get(
                    "weight",
                    -1,
                )
            )
            == float(
                weight
            )
        )

    def _request_duplicate_confirmation(
        self,
        puppy_id: str,
        puppy_name: str,
        weight: float,
    ) -> None:
        """Store pending duplicate confirmation."""

        session = get_session(
            self.data
        )

        expires_at = (
            dt_util.now().timestamp()
            + DUPLICATE_CONFIRMATION_SECONDS
        )

        expires_datetime = (
            datetime.fromtimestamp(
                expires_at,
                tz=(
                    dt_util.DEFAULT_TIME_ZONE
                ),
            )
        )

        session[
            "duplicate_pending"
        ] = {
            "puppy_id": puppy_id,
            "weight": float(
                weight
            ),
            "expires_at": (
                expires_datetime.isoformat()
            ),
        }

        session[
            "message"
        ] = (
            f"{puppy_name} is minder dan "
            f"2 minuten geleden gewogen. "
            f"Druk nogmaals op Gewicht opslaan "
            f"om {weight:g} g te bevestigen."
        )

        async_dispatcher_send(
            self.hass,
            SIGNAL_DASHBOARD_UPDATE,
        )

    async def async_press(
        self,
    ) -> None:
        """Save entered weight."""

        litter_id = self.data.get(
            "selected_litter_id"
        )

        puppy_id = self.data.get(
            "selected_puppy_id"
        )

        weight = float(
            self.data.get(
                "weight_input",
                0.0,
            )
        )

        if not litter_id:
            raise HomeAssistantError(
                "Selecteer eerst een nest."
            )

        if not puppy_id:
            raise HomeAssistantError(
                "Selecteer eerst een puppy."
            )

        if weight <= 0:
            raise HomeAssistantError(
                "Voer eerst een gewicht groter dan 0 gram in."
            )

        puppy = self.storage.get_puppy(
            litter_id,
            puppy_id,
        )

        if puppy is None:
            raise HomeAssistantError(
                "De geselecteerde puppy bestaat niet meer."
            )

        if not puppy.get(
            "active",
            True,
        ):
            raise HomeAssistantError(
                "De geselecteerde puppy is gearchiveerd."
            )

        puppy_name = puppy.get(
            "name",
            "Puppy",
        )

        if self._has_recent_dashboard_measurement(
            litter_id,
            puppy_id,
        ):
            if not self._duplicate_is_confirmed(
                puppy_id,
                weight,
            ):
                self._request_duplicate_confirmation(
                    puppy_id,
                    puppy_name,
                    weight,
                )

                raise HomeAssistantError(
                    "Mogelijke dubbele meting. "
                    "Druk binnen 30 seconden nogmaals "
                    "op Gewicht opslaan om te bevestigen."
                )

        measurement_id = (
            await self.storage.async_record_weight(
                litter_id=litter_id,
                puppy_id=puppy_id,
                weight=weight,
                note="Dashboardweging",
            )
        )

        session_completed = mark_weight_recorded(
            self.data,
            litter_id=litter_id,
            puppy_id=puppy_id,
            puppy_name=puppy_name,
            weight=weight,
        )

        if session_completed:
            await self.storage.async_record_completed_weighing_session(
                litter_id,
                get_session(self.data),
            )

        # Clear input to prevent accidentally reusing
        # the previous puppy's weight.
        self.data[
            "weight_input"
        ] = 0.0

        async_dispatcher_send(
            self.hass,
            SIGNAL_UPDATE,
            puppy_id,
        )

        async_dispatcher_send(
            self.hass,
            SIGNAL_DASHBOARD_UPDATE,
        )

        _LOGGER.info(
            "Dashboard recorded %.1f g for puppy '%s' "
            "(measurement %s)",
            weight,
            puppy_name,
            measurement_id,
        )


class PuppyResetSessionButton(
    PuppyWeighingButtonBase
):
    """Reset weighing session."""

    _attr_name = "Weegsessie resetten"
    _attr_icon = "mdi:restart"
    _attr_unique_id = (
        "puppy_weight_tracker_reset_session"
    )

    async def async_press(
        self,
    ) -> None:
        """Reset session."""

        reset_weighing_session(
            self.data
        )

        async_dispatcher_send(
            self.hass,
            SIGNAL_DASHBOARD_UPDATE,
        )

        _LOGGER.info(
            "Reset puppy weighing session"
        )