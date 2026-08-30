"""Select entities for Puppy Weight Tracker."""

from __future__ import annotations

from typing import Any

from homeassistant.components.select import SelectEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
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
from .runtime import (
    PuppyWeightTrackerRuntimeData,
    reconcile_dashboard_selection,
)
from .session import (
    SESSION_ACTIVE,
    get_session,
)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Set up dashboard selectors."""

    async_add_entities(
        [
            PuppyLitterSelect(
                hass,
                entry,
            ),
            PuppySelect(
                hass,
                entry,
            ),
        ]
    )


class PuppyDashboardSelectBase(
    SelectEntity
):
    """Base dashboard selector."""

    _attr_has_entity_name = True

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
    ) -> None:
        """Initialize selector."""

        self._hass = hass
        self._entry = entry

    @property
    def data(
        self,
    ) -> PuppyWeightTrackerRuntimeData:
        """Return integration runtime data."""

        runtime = self._entry.runtime_data
        if not isinstance(runtime, PuppyWeightTrackerRuntimeData):
            raise RuntimeError("Puppy Weight Tracker runtime is unavailable")
        return runtime

    @property
    def storage(
        self,
    ):
        """Return storage."""

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
                "Puppy Weight Tracker"
            ),
            model="Weegstation",
        )

    async def async_added_to_hass(
        self,
    ) -> None:
        """Subscribe to dashboard updates."""

        reconcile_dashboard_selection(
            self.data
        )

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
        """Reconcile selections and refresh selector state."""

        reconcile_dashboard_selection(
            self.data
        )
        self.async_write_ha_state()


class PuppyLitterSelect(
    PuppyDashboardSelectBase
):
    """Select active litter."""

    _attr_name = "Nest"
    _attr_icon = "mdi:dog-side"
    _attr_unique_id = (
        "puppy_tracker_litter_select"
    )

    def _available_litters(
        self,
    ) -> dict[str, dict[str, Any]]:
        """Return active litters."""

        return {
            litter_id: litter
            for litter_id, litter
            in self.storage.get_litters().items()
            if litter.get(
                "active",
                True,
            )
        }

    def _option_map(
        self,
    ) -> dict[str, str]:
        """Map visible option to litter ID."""

        litters = self._available_litters()

        result: dict[
            str,
            str
        ] = {}

        used: dict[
            str,
            int
        ] = {}

        for litter_id, litter in (
            litters.items()
        ):
            base = litter.get(
                "name",
                "Nest",
            )

            count = used.get(
                base,
                0,
            ) + 1

            used[
                base
            ] = count

            label = (
                base
                if count == 1
                else f"{base} · {count}"
            )

            result[
                label
            ] = litter_id

        return result

    @property
    def options(
        self,
    ) -> list[str]:
        """Return litter options."""

        return list(
            self._option_map().keys()
        )

    @property
    def current_option(
        self,
    ) -> str | None:
        """Return selected litter."""

        selected_id = self.data.selected_litter_id

        option_map = (
            self._option_map()
        )

        for label, litter_id in (
            option_map.items()
        ):
            if litter_id == selected_id:
                return label

        return None

    async def async_select_option(
        self,
        option: str,
    ) -> None:
        """Select litter."""

        option_map = (
            self._option_map()
        )

        litter_id = option_map.get(
            option
        )

        if litter_id is None:
            raise HomeAssistantError(
                "Dit nest is niet beschikbaar."
            )

        session = get_session(
            self.data
        )

        if (
            session.get("status")
            == SESSION_ACTIVE
            and session.get(
                "litter_id"
            )
            != litter_id
        ):
            raise HomeAssistantError(
                "Tijdens een actieve weegsessie "
                "kan het nest niet worden gewijzigd. "
                "Rond de sessie af of reset deze eerst."
            )

        self.data.selected_litter_id = litter_id
        self.data.selected_puppy_id = None

        session[
            "duplicate_pending"
        ] = None

        async_dispatcher_send(
            self.hass,
            SIGNAL_DASHBOARD_UPDATE,
        )


class PuppySelect(
    PuppyDashboardSelectBase
):
    """Select puppy from selected litter."""

    _attr_name = "Puppy"
    _attr_icon = "mdi:dog"
    _attr_unique_id = (
        "puppy_tracker_puppy_select"
    )

    def _available_puppies(
        self,
    ) -> dict[str, dict[str, Any]]:
        """Return puppies available for selection."""

        litter_id = self.data.selected_litter_id

        if not litter_id:
            return {}

        litter = self.storage.get_litter(
            litter_id
        )

        if litter is None:
            return {}

        all_puppies = litter.get(
            "puppies",
            {},
        )

        session = self.data.weighing_session

        if (
            session.get("status")
            == SESSION_ACTIVE
            and session.get(
                "litter_id"
            )
            == litter_id
        ):
            result = {}

            for puppy_id in session.get(
                "puppy_ids",
                [],
            ):
                puppy = all_puppies.get(
                    puppy_id
                )

                if (
                    puppy is not None
                    and puppy.get(
                        "active",
                        True,
                    )
                ):
                    result[
                        puppy_id
                    ] = puppy

            return result

        return {
            puppy_id: puppy
            for puppy_id, puppy
            in all_puppies.items()
            if puppy.get(
                "active",
                True,
            )
        }

    @staticmethod
    def _base_label(
        puppy: dict[str, Any],
    ) -> str:
        """Create base puppy display label."""

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

    def _option_map(
        self,
    ) -> dict[str, str]:
        """Map unique visible labels to puppy IDs."""

        puppies = (
            self._available_puppies()
        )

        result: dict[
            str,
            str
        ] = {}

        used: dict[
            str,
            int
        ] = {}

        for puppy_id, puppy in (
            puppies.items()
        ):
            base = self._base_label(
                puppy
            )

            count = used.get(
                base,
                0,
            ) + 1

            used[
                base
            ] = count

            label = (
                base
                if count == 1
                else f"{base} · {count}"
            )

            result[
                label
            ] = puppy_id

        return result

    @property
    def options(
        self,
    ) -> list[str]:
        """Return puppy options."""

        return list(
            self._option_map().keys()
        )

    @property
    def current_option(
        self,
    ) -> str | None:
        """Return selected puppy."""

        puppy_id = self.data.selected_puppy_id

        option_map = (
            self._option_map()
        )

        for label, option_id in (
            option_map.items()
        ):
            if option_id == puppy_id:
                return label

        return None

    async def async_select_option(
        self,
        option: str,
    ) -> None:
        """Select puppy."""

        option_map = (
            self._option_map()
        )

        puppy_id = option_map.get(
            option
        )

        if puppy_id is None:
            raise HomeAssistantError(
                "Deze puppy is niet beschikbaar."
            )

        self.data.selected_puppy_id = puppy_id

        session = get_session(
            self.data
        )

        session[
            "duplicate_pending"
        ] = None

        async_dispatcher_send(
            self.hass,
            SIGNAL_DASHBOARD_UPDATE,
        )