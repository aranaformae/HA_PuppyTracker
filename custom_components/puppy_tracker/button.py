"""Button entities for Puppy Tracker."""

from __future__ import annotations

from copy import deepcopy
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
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_UPDATE,
)
from .runtime import PuppyTrackerRuntimeData
from .session import (
    SESSION_ACTIVE,
    SESSION_INTERRUPTED,
    async_resolve_session,
    get_session,
    reset_weighing_session,
    start_weighing_session,
    sync_station_session,
)
from .weighing import async_save_dashboard_weight


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
    ) -> PuppyTrackerRuntimeData:
        """Return runtime data."""

        runtime = self._entry.runtime_data
        if not isinstance(runtime, PuppyTrackerRuntimeData):
            raise RuntimeError("Puppy Tracker runtime is unavailable")
        return runtime

    @property
    def storage(
        self,
    ):
        """Return persistent storage."""

        return self.data.storage

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


class PuppyStartSessionButton(
    PuppyWeighingButtonBase
):
    """Start a litter weighing session."""

    _attr_name = "Weegsessie starten"
    _attr_icon = "mdi:play-circle"
    _attr_unique_id = (
        "puppy_tracker_start_session"
    )

    async def async_press(
        self,
    ) -> None:
        sync_station_session(self.data)
        session = get_session(self.data)
        if session.get("status") == SESSION_INTERRUPTED:
            await async_resolve_session(self.data, resume=True, session_id=session["id"], revision=session["revision"])
        else:
            async with self.data.weighing_lock:
                await self._async_start()
        async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)

    async def _async_start(
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

        litter_id = self.data.selected_litter_id

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

        before = deepcopy(session)
        selection = (self.data.selected_litter_id, self.data.selected_puppy_id, self.data.weight_input)
        start_weighing_session(
            self.data,
            litter_id,
            puppy_ids,
        )
        staged = self.data.weighing_session
        self.data.weighing_session = before
        try:
            await self.storage.async_set_weighing_session(staged, expected=before)
        except Exception:
            self.data.selected_litter_id, self.data.selected_puppy_id, self.data.weight_input = selection
            raise
        self.data.weighing_session = staged
        self.data.weighing_undo = None

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
        "puppy_tracker_save_weight"
    )

    async def async_press(self) -> None:
        """Save an explicit snapshot of the current native station controls."""
        litter_id = self.data.selected_litter_id
        puppy_id = self.data.selected_puppy_id
        weight = float(self.data.weight_input)
        if not litter_id or not puppy_id:
            raise HomeAssistantError("Selecteer eerst een nest en een puppy.")
        try:
            measurement_id = await async_save_dashboard_weight(
                self.data, litter_id=litter_id, puppy_id=puppy_id, weight=weight,
            )
        except ValueError as err:
            async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)
            raise HomeAssistantError(str(err)) from err
        puppy_name = self.storage.get_puppy(litter_id, puppy_id).get("name", "Puppy")

        # Clear input to prevent accidentally reusing
        # the previous puppy's weight.
        self.data.weight_input = 0.0

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
        "puppy_tracker_reset_session"
    )

    async def async_press(
        self,
    ) -> None:
        """Reset session."""

        async with self.data.weighing_lock:
            sync_station_session(self.data)
            await self.storage.async_set_weighing_session(None, expected=get_session(self.data))
            reset_weighing_session(self.data)

        async_dispatcher_send(
            self.hass,
            SIGNAL_DASHBOARD_UPDATE,
        )

        _LOGGER.info(
            "Reset puppy weighing session"
        )
