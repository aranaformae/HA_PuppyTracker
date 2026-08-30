"""Config flow and options flow for Puppy Weight Tracker."""

from __future__ import annotations

from homeassistant.util import dt as dt_util

import logging
from typing import Any

import voluptuous as vol

from homeassistant import config_entries
from homeassistant.config_entries import (
    ConfigEntry,
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.const import UnitOfTime
from homeassistant.core import callback
from homeassistant.helpers import selector
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import (
    DEFAULT_GROWTH_MONITORING_DAYS,
    DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
    DEFAULT_MIN_DAILY_GROWTH_PERCENT,
    DEFAULT_NOTIFICATIONS_ENABLED,
    DEFAULT_NOTIFY_RECOVERY,
    DEFAULT_NOTIFY_SESSION_COMPLETE,
    DEFAULT_NOTIFY_ENTITIES,
    DOMAIN,
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_NEW_LITTER,
    SIGNAL_NEW_PUPPY,
    SIGNAL_UPDATE,
)
from .devices import (
    async_remove_litter_device,
    async_remove_puppy_device,
    async_sync_devices,
)
from .measurements import measurement_status
from .runtime import PuppyWeightTrackerRuntimeData
from .storage import PuppyWeightStorage
from .time_utils import (
    current_selector_datetime,
    format_local_timestamp,
    selector_datetime_value,
)

_LOGGER = logging.getLogger(__name__)


class PuppyWeightTrackerConfigFlow(
    config_entries.ConfigFlow,
    domain=DOMAIN,
):
    """Handle Puppy Weight Tracker setup."""

    VERSION = 1

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Handle initial setup."""

        if user_input is not None:
            return self.async_create_entry(
                title="Puppy Weight Tracker",
                data={},
            )

        return self.async_show_form(
            step_id="user"
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> PuppyWeightTrackerOptionsFlow:
        """Return options flow."""
        return PuppyWeightTrackerOptionsFlow()


class PuppyWeightTrackerOptionsFlow(
    OptionsFlow
):
    """Handle Puppy Weight Tracker management."""

    def _get_storage(
        self,
    ) -> PuppyWeightStorage:
        """Return integration storage."""

        runtime = self.config_entry.runtime_data
        if not isinstance(runtime, PuppyWeightTrackerRuntimeData):
            raise RuntimeError("Puppy Weight Tracker is not loaded")
        return runtime.storage

    async def async_step_init(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Show management menu."""

        return self.async_show_menu(
            step_id="init",
            menu_options=[
                "create_litter",
                "manage_litter",
                "add_puppy",
                "manage_puppy",
                "manage_measurements",
                "integrity",
                "settings",
            ],
        )

    async def async_step_create_litter(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Create a litter."""

        errors: dict[str, str] = {}

        if user_input is not None:
            storage = self._get_storage()

            try:
                litter_id = await storage.async_create_litter(
                    name=user_input["name"],
                    birth_date=user_input.get(
                        "birth_date"
                    ),
                    mother=user_input.get(
                        "mother"
                    ),
                    father=user_input.get(
                        "father"
                    ),
                )

                async_sync_devices(
                    self.hass,
                    self.config_entry,
                    storage.get_data(),
                )

                async_dispatcher_send(
                    self.hass,
                    SIGNAL_NEW_LITTER,
                    litter_id,
                )

                async_dispatcher_send(
                    self.hass,
                    SIGNAL_DASHBOARD_UPDATE,
                )

            except Exception:
                _LOGGER.exception(
                    "Error creating litter"
                )
                errors["base"] = "unknown"

            else:
                return self.async_create_entry(
                    title="",
                    data={},
                )

        return self.async_show_form(
            step_id="create_litter",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        "name"
                    ): selector.TextSelector(),

                    vol.Optional(
                        "birth_date"
                    ): selector.DateSelector(),

                    vol.Optional(
                        "mother"
                    ): selector.TextSelector(),

                    vol.Optional(
                        "father"
                    ): selector.TextSelector(),
                }
            ),
            errors=errors,
        )

    async def async_step_manage_litter(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose a litter to manage."""

        storage = self._get_storage()
        litters = storage.get_litters()

        if not litters:
            return self.async_abort(
                reason="no_litters"
            )

        options = [
            selector.SelectOptionDict(
                value=litter_id,
                label=litter.get(
                    "name",
                    "Litter",
                ),
            )
            for litter_id, litter
            in litters.items()
        ]

        if user_input is not None:
            self._selected_litter_id = (
                user_input["litter_id"]
            )

            return await self.async_step_edit_litter()

        return self.async_show_form(
            step_id="manage_litter",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        "litter_id"
                    ): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    async def async_step_edit_litter(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Edit a litter."""

        storage = self._get_storage()

        litter = storage.get_litter(
            self._selected_litter_id
        )

        if litter is None:
            return self.async_abort(
                reason="invalid_litter"
            )

        if user_input is not None:
            action = user_input[
                "action"
            ]

            try:
                if action == "save":
                    await storage.async_update_litter(
                        self._selected_litter_id,
                        name=user_input["name"],
                        birth_date=user_input.get(
                            "birth_date"
                        ),
                        mother=user_input.get(
                            "mother"
                        ),
                        father=user_input.get(
                            "father"
                        ),
                    )

                    async_sync_devices(
                        self.hass,
                        self.config_entry,
                        storage.get_data(),
                    )

                    async_dispatcher_send(
                        self.hass,
                        SIGNAL_DASHBOARD_UPDATE,
                    )

                    return self.async_create_entry(
                        title="",
                        data={},
                    )

                if action == "toggle_archive":
                    await storage.async_set_litter_active(
                        self._selected_litter_id,
                        not litter.get(
                            "active",
                            True,
                        ),
                    )

                    async_dispatcher_send(
                        self.hass,
                        SIGNAL_DASHBOARD_UPDATE,
                    )

                    return self.async_create_entry(
                        title="",
                        data={},
                    )

                if action == "delete":
                    return await self.async_step_confirm_delete_litter()

            except Exception:
                _LOGGER.exception(
                    "Error managing litter"
                )

                return self.async_show_form(
                    step_id="edit_litter",
                    data_schema=self._litter_edit_schema(
                        litter
                    ),
                    errors={
                        "base": "unknown"
                    },
                )

        return self.async_show_form(
            step_id="edit_litter",
            data_schema=self._litter_edit_schema(
                litter
            ),
        )

    def _litter_edit_schema(
        self,
        litter: dict[str, Any],
    ) -> vol.Schema:
        """Build litter edit schema."""

        fields: dict[Any, Any] = {
            vol.Required(
                "name",
                default=litter.get(
                    "name",
                    "",
                ),
            ): selector.TextSelector(),
        }

        birth_date = litter.get(
            "birth_date"
        )

        if birth_date:
            fields[
                vol.Optional(
                    "birth_date",
                    default=birth_date,
                )
            ] = selector.DateSelector()
        else:
            fields[
                vol.Optional(
                    "birth_date"
                )
            ] = selector.DateSelector()

        fields[
            vol.Optional(
                "mother",
                default=litter.get(
                    "mother",
                    "",
                )
                or "",
            )
        ] = selector.TextSelector()

        fields[
            vol.Optional(
                "father",
                default=litter.get(
                    "father",
                    "",
                )
                or "",
            )
        ] = selector.TextSelector()

        action_translation_key = (
            "active_item_action"
            if litter.get(
                "active",
                True,
            )
            else "archived_item_action"
        )

        fields[
            vol.Required(
                "action",
                default="save",
            )
        ] = selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=[
                    "save",
                    "toggle_archive",
                    "delete",
                ],
                translation_key=(
                    action_translation_key
                ),
                mode=selector.SelectSelectorMode.DROPDOWN,
            )
        )

        return vol.Schema(
            fields
        )

    async def async_step_confirm_delete_litter(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Confirm permanent litter deletion."""

        storage = self._get_storage()

        litter = storage.get_litter(
            self._selected_litter_id
        )

        if litter is None:
            return self.async_abort(
                reason="invalid_litter"
            )

        puppy_ids = list(
            litter.get(
                "puppies",
                {},
            ).keys()
        )

        measurement_count = sum(
            len(
                puppy.get(
                    "measurements",
                    [],
                )
            )
            for puppy in litter.get(
                "puppies",
                {},
            ).values()
        )

        if user_input is not None:
            if user_input[
                "confirm"
            ]:
                await storage.async_delete_litter(
                    self._selected_litter_id
                )

                async_remove_litter_device(
                    self.hass,
                    self.config_entry,
                    self._selected_litter_id,
                    puppy_ids,
                )

                async_dispatcher_send(
                    self.hass,
                    SIGNAL_DASHBOARD_UPDATE,
                )

            return self.async_create_entry(
                title="",
                data={},
            )

        return self.async_show_form(
            step_id="confirm_delete_litter",
            description_placeholders={
                "name": litter.get(
                    "name",
                    "",
                ),
                "puppies": str(
                    len(puppy_ids)
                ),
                "measurements": str(
                    measurement_count
                ),
            },
            data_schema=vol.Schema(
                {
                    vol.Required(
                        "confirm",
                        default=False,
                    ): selector.BooleanSelector()
                }
            ),
        )

    async def async_step_add_puppy(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Add a puppy."""

        storage = self._get_storage()
        litters = storage.get_litters()

        active_litters = {
            litter_id: litter
            for litter_id, litter
            in litters.items()
            if litter.get(
                "active",
                True,
            )
        }

        if not active_litters:
            return self.async_abort(
                reason="no_litters"
            )

        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                puppy_id = await storage.async_add_puppy(
                    litter_id=user_input[
                        "litter_id"
                    ],
                    name=user_input[
                        "name"
                    ],
                    collar_color=user_input.get(
                        "collar_color"
                    ),
                    sex=user_input.get(
                        "sex"
                    ),
                    birth_weight=user_input.get(
                        "birth_weight"
                    ),
                    birth_time=user_input.get(
                        "birth_time"
                    ),
                    notes=user_input.get(
                        "notes"
                    ),
                )

                async_sync_devices(
                    self.hass,
                    self.config_entry,
                    storage.get_data(),
                )

                async_dispatcher_send(
                    self.hass,
                    SIGNAL_NEW_PUPPY,
                    user_input[
                        "litter_id"
                    ],
                    puppy_id,
                )

                async_dispatcher_send(
                    self.hass,
                    SIGNAL_UPDATE,
                    puppy_id,
                )

                async_dispatcher_send(
                    self.hass,
                    SIGNAL_DASHBOARD_UPDATE,
                )

            except ValueError:
                errors[
                    "base"
                ] = "invalid_litter"

            except Exception:
                _LOGGER.exception(
                    "Error adding puppy"
                )
                errors[
                    "base"
                ] = "unknown"

            else:
                return self.async_create_entry(
                    title="",
                    data={},
                )

        litter_options = [
            selector.SelectOptionDict(
                value=litter_id,
                label=litter.get(
                    "name",
                    "Litter",
                ),
            )
            for litter_id, litter
            in active_litters.items()
        ]

        return self.async_show_form(
            step_id="add_puppy",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        "litter_id"
                    ): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=litter_options,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    ),

                    vol.Required(
                        "name"
                    ): selector.TextSelector(),

                    vol.Optional(
                        "collar_color"
                    ): selector.TextSelector(),

                    vol.Optional(
                        "sex"
                    ): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=[
                                "male",
                                "female",
                            ],
                            translation_key="sex",
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    ),

                    vol.Optional(
                        "birth_weight"
                    ): selector.NumberSelector(
                        selector.NumberSelectorConfig(
                            min=1,
                            max=5000,
                            step=1,
                            unit_of_measurement="g",
                            mode=selector.NumberSelectorMode.BOX,
                        )
                    ),

                    vol.Optional(
                        "birth_time",
                        default=current_selector_datetime(),
                    ): selector.DateTimeSelector(),

                    vol.Optional(
                        "notes"
                    ): selector.TextSelector(
                        selector.TextSelectorConfig(
                            multiline=True
                        )
                    ),
                }
            ),
            errors=errors,
        )

    async def async_step_manage_puppy(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose puppy to manage."""

        storage = self._get_storage()
        litters = storage.get_litters()

        options: list[
            selector.SelectOptionDict
        ] = []

        for litter_id, litter in litters.items():
            for puppy_id, puppy in litter.get(
                "puppies",
                {},
            ).items():
                options.append(
                    selector.SelectOptionDict(
                        value=(
                            f"{litter_id}|"
                            f"{puppy_id}"
                        ),
                        label=(
                            f"{litter.get('name', 'Litter')}"
                            f" - "
                            f"{puppy.get('name', 'Puppy')}"
                        ),
                    )
                )

        if not options:
            return self.async_abort(
                reason="no_puppies"
            )

        if user_input is not None:
            litter_id, puppy_id = (
                user_input[
                    "puppy"
                ].split(
                    "|",
                    1,
                )
            )

            self._selected_litter_id = (
                litter_id
            )
            self._selected_puppy_id = (
                puppy_id
            )

            return await self.async_step_edit_puppy()

        return self.async_show_form(
            step_id="manage_puppy",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        "puppy"
                    ): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    async def async_step_edit_puppy(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Edit puppy."""

        storage = self._get_storage()

        puppy = storage.get_puppy(
            self._selected_litter_id,
            self._selected_puppy_id,
        )

        if puppy is None:
            return self.async_abort(
                reason="invalid_puppy"
            )

        if user_input is not None:
            action = user_input[
                "action"
            ]

            try:
                if action == "save":
                    await storage.async_update_puppy(
                        self._selected_litter_id,
                        self._selected_puppy_id,
                        name=user_input[
                            "name"
                        ],
                        collar_color=user_input.get(
                            "collar_color"
                        ),
                        sex=user_input.get(
                            "sex"
                        ),
                        birth_weight=user_input.get(
                            "birth_weight"
                        ),
                        birth_time=user_input.get(
                            "birth_time"
                        ),
                        notes=user_input.get(
                            "notes"
                        ),
                    )

                    async_sync_devices(
                        self.hass,
                        self.config_entry,
                        storage.get_data(),
                    )

                    async_dispatcher_send(
                        self.hass,
                        SIGNAL_UPDATE,
                        self._selected_puppy_id,
                    )

                    async_dispatcher_send(
                        self.hass,
                        SIGNAL_DASHBOARD_UPDATE,
                    )

                    return self.async_create_entry(
                        title="",
                        data={},
                    )

                if action == "toggle_archive":
                    await storage.async_set_puppy_active(
                        self._selected_litter_id,
                        self._selected_puppy_id,
                        not puppy.get(
                            "active",
                            True,
                        ),
                    )

                    async_dispatcher_send(
                        self.hass,
                        SIGNAL_UPDATE,
                        self._selected_puppy_id,
                    )

                    async_dispatcher_send(
                        self.hass,
                        SIGNAL_DASHBOARD_UPDATE,
                    )

                    return self.async_create_entry(
                        title="",
                        data={},
                    )

                if action == "delete":
                    return await self.async_step_confirm_delete_puppy()

            except Exception:
                _LOGGER.exception(
                    "Error managing puppy"
                )

                return self.async_show_form(
                    step_id="edit_puppy",
                    data_schema=self._puppy_edit_schema(
                        puppy
                    ),
                    errors={
                        "base": "unknown"
                    },
                )

        return self.async_show_form(
            step_id="edit_puppy",
            data_schema=self._puppy_edit_schema(
                puppy
            ),
        )

    def _puppy_edit_schema(
        self,
        puppy: dict[str, Any],
    ) -> vol.Schema:
        """Build puppy edit schema."""

        fields: dict[Any, Any] = {
            vol.Required(
                "name",
                default=puppy.get(
                    "name",
                    "",
                ),
            ): selector.TextSelector(),

            vol.Optional(
                "collar_color",
                default=puppy.get(
                    "collar_color",
                    "",
                )
                or "",
            ): selector.TextSelector(),
        }

        sex = puppy.get(
            "sex"
        )

        if sex:
            fields[
                vol.Optional(
                    "sex",
                    default=sex,
                )
            ] = selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[
                        "male",
                        "female",
                    ],
                    translation_key="sex",
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            )
        else:
            fields[
                vol.Optional(
                    "sex"
                )
            ] = selector.SelectSelector(
                selector.SelectSelectorConfig(
                    options=[
                        "male",
                        "female",
                    ],
                    translation_key="sex",
                    mode=selector.SelectSelectorMode.DROPDOWN,
                )
            )

        birth_weight = puppy.get(
            "birth_weight"
        )

        weight_selector = (
            selector.NumberSelector(
                selector.NumberSelectorConfig(
                    min=1,
                    max=5000,
                    step=1,
                    unit_of_measurement="g",
                    mode=selector.NumberSelectorMode.BOX,
                )
            )
        )

        if birth_weight is not None:
            fields[
                vol.Optional(
                    "birth_weight",
                    default=birth_weight,
                )
            ] = weight_selector
        else:
            fields[
                vol.Optional(
                    "birth_weight"
                )
            ] = weight_selector

        birth_time = puppy.get(
            "birth_time"
        )

        if birth_time:
            fields[
                vol.Optional(
                    "birth_time",
                    default=selector_datetime_value(birth_time),
                )
            ] = selector.DateTimeSelector()
        else:
            fields[
                vol.Optional(
                    "birth_time"
                )
            ] = selector.DateTimeSelector()

        fields[
            vol.Optional(
                "notes",
                default=puppy.get(
                    "notes",
                    "",
                )
                or "",
            )
        ] = selector.TextSelector(
            selector.TextSelectorConfig(
                multiline=True
            )
        )

        action_translation_key = (
            "active_item_action"
            if puppy.get(
                "active",
                True,
            )
            else "archived_item_action"
        )

        fields[
            vol.Required(
                "action",
                default="save",
            )
        ] = selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=[
                    "save",
                    "toggle_archive",
                    "delete",
                ],
                translation_key=(
                    action_translation_key
                ),
                mode=selector.SelectSelectorMode.DROPDOWN,
            )
        )

        return vol.Schema(
            fields
        )

    async def async_step_confirm_delete_puppy(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Confirm permanent puppy deletion."""

        storage = self._get_storage()

        puppy = storage.get_puppy(
            self._selected_litter_id,
            self._selected_puppy_id,
        )

        if puppy is None:
            return self.async_abort(
                reason="invalid_puppy"
            )

        measurement_count = len(
            puppy.get(
                "measurements",
                [],
            )
        )

        if user_input is not None:
            if user_input[
                "confirm"
            ]:
                await storage.async_delete_puppy(
                    self._selected_litter_id,
                    self._selected_puppy_id,
                )

                async_remove_puppy_device(
                    self.hass,
                    self.config_entry,
                    self._selected_puppy_id,
                )

                async_dispatcher_send(
                    self.hass,
                    SIGNAL_DASHBOARD_UPDATE,
                )

            return self.async_create_entry(
                title="",
                data={},
            )

        return self.async_show_form(
            step_id="confirm_delete_puppy",
            description_placeholders={
                "name": puppy.get(
                    "name",
                    "",
                ),
                "measurements": str(
                    measurement_count
                ),
            },
            data_schema=vol.Schema(
                {
                    vol.Required(
                        "confirm",
                        default=False,
                    ): selector.BooleanSelector()
                }
            ),
        )

    async def async_step_manage_measurements(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose a puppy whose measurements should be managed."""
        storage = self._get_storage()
        litters = storage.get_litters()

        options: list[selector.SelectOptionDict] = []
        for litter_id, litter in litters.items():
            for puppy_id, puppy in litter.get("puppies", {}).items():
                options.append(
                    selector.SelectOptionDict(
                        value=f"{litter_id}|{puppy_id}",
                        label=(
                            f"{litter.get('name', 'Litter')} - "
                            f"{puppy.get('name', 'Puppy')}"
                        ),
                    )
                )

        if not options:
            return self.async_abort(reason="no_puppies")

        if user_input is not None:
            litter_id, puppy_id = user_input["puppy"].split("|", 1)
            self._selected_litter_id = litter_id
            self._selected_puppy_id = puppy_id
            return await self.async_step_select_measurement()

        return self.async_show_form(
            step_id="manage_measurements",
            data_schema=vol.Schema(
                {
                    vol.Required("puppy"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    @staticmethod
    def _measurement_option_label(measurement: dict[str, Any]) -> str:
        """Create a compact human-readable measurement label."""
        timestamp = measurement.get("timestamp") or ""
        display_time = format_local_timestamp(
            timestamp,
            fallback=timestamp,
        )

        weight = measurement.get("weight")
        try:
            display_weight = f"{float(weight):g} g"
        except (TypeError, ValueError):
            display_weight = "? g"

        note = measurement.get("note")
        note_text = f" · {note}" if note else ""

        status_code = measurement_status(measurement)
        if status_code == "deleted":
            status = " · 🗑"
        elif status_code == "superseded":
            status = " · ↪"
        else:
            status = ""

        return f"{display_time} · {display_weight}{note_text}{status}"

    async def async_step_select_measurement(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Choose a measurement to inspect, correct, delete, or restore."""
        storage = self._get_storage()
        puppy = storage.get_puppy(
            self._selected_litter_id,
            self._selected_puppy_id,
        )
        if puppy is None:
            return self.async_abort(reason="invalid_puppy")

        try:
            measurements = storage.get_measurements(
                self._selected_litter_id,
                self._selected_puppy_id,
                include_inactive=True,
            )
        except ValueError:
            return self.async_abort(reason="invalid_puppy")

        if not measurements:
            return self.async_abort(reason="no_measurements")

        options = [
            selector.SelectOptionDict(
                value=measurement["id"],
                label=self._measurement_option_label(measurement),
            )
            for measurement in measurements
        ]

        if user_input is not None:
            self._selected_measurement_id = user_input["measurement_id"]
            return await self.async_step_edit_measurement()

        return self.async_show_form(
            step_id="select_measurement",
            description_placeholders={
                "puppy": puppy.get("name", "Puppy"),
                "count": str(len(measurements)),
            },
            data_schema=vol.Schema(
                {
                    vol.Required("measurement_id"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=options,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                }
            ),
        )

    async def async_step_edit_measurement(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Correct, soft-delete, or restore a measurement."""
        storage = self._get_storage()
        puppy = storage.get_puppy(
            self._selected_litter_id,
            self._selected_puppy_id,
        )
        measurement = storage.get_measurement(
            self._selected_litter_id,
            self._selected_puppy_id,
            self._selected_measurement_id,
        )

        if puppy is None:
            return self.async_abort(reason="invalid_puppy")
        if measurement is None:
            return self.async_abort(reason="invalid_measurement")

        if measurement.get("superseded_by") is not None:
            return self.async_abort(
                reason="historical_measurement",
                description_placeholders={
                    "puppy": puppy.get("name", "Puppy"),
                    "measurement": self._measurement_option_label(measurement),
                    "replacement": str(measurement.get("superseded_by")),
                },
            )

        errors: dict[str, str] = {}

        if user_input is not None:
            action = user_input["action"]
            reason = user_input.get("reason") or None
            try:
                if action == "save":
                    new_weight = float(user_input["weight"])
                    new_timestamp = user_input["timestamp"]
                    changed = (
                        new_weight != float(measurement["weight"])
                        or new_timestamp != measurement.get("timestamp")
                    )
                    if changed:
                        await storage.async_correct_measurement(
                            self._selected_litter_id,
                            self._selected_puppy_id,
                            self._selected_measurement_id,
                            new_weight=new_weight,
                            new_timestamp=new_timestamp,
                            reason=reason,
                        )

                elif action == "delete":
                    return await self.async_step_confirm_delete_measurement()

                elif action == "restore":
                    await storage.async_restore_weight(
                        self._selected_litter_id,
                        self._selected_puppy_id,
                        self._selected_measurement_id,
                        reason=reason,
                    )

                else:
                    raise ValueError("Unknown measurement action")

                async_dispatcher_send(
                    self.hass, SIGNAL_UPDATE, self._selected_puppy_id
                )
                async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)
                return self.async_create_entry(title="", data={})

            except ValueError:
                errors["base"] = "invalid_measurement"
            except Exception:
                _LOGGER.exception("Error managing puppy measurement")
                errors["base"] = "unknown"

        if measurement.get("deleted", False):
            schema = vol.Schema(
                {
                    vol.Optional("reason"): selector.TextSelector(
                        selector.TextSelectorConfig(multiline=True)
                    ),
                    vol.Required("action", default="restore"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=["restore"],
                            translation_key="deleted_measurement_action",
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    ),
                }
            )
        else:
            schema = vol.Schema(
                {
                    vol.Required(
                        "weight", default=float(measurement["weight"])
                    ): selector.NumberSelector(
                        selector.NumberSelectorConfig(
                            min=1,
                            max=10000,
                            step=1,
                            unit_of_measurement="g",
                            mode=selector.NumberSelectorMode.BOX,
                        )
                    ),
                    vol.Required(
                        "timestamp",
                        default=selector_datetime_value(
                            measurement.get("timestamp")
                        ),
                    ): selector.DateTimeSelector(),
                    vol.Optional("reason"): selector.TextSelector(
                        selector.TextSelectorConfig(multiline=True)
                    ),
                    vol.Required("action", default="save"): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=["save", "delete"],
                            translation_key="active_measurement_action",
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    ),
                }
            )

        return self.async_show_form(
            step_id="edit_measurement",
            description_placeholders={
                "puppy": puppy.get("name", "Puppy"),
                "measurement": self._measurement_option_label(measurement),
            },
            data_schema=schema,
            errors=errors,
        )

    async def async_step_confirm_delete_measurement(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Confirm soft deletion of a measurement."""
        storage = self._get_storage()
        puppy = storage.get_puppy(
            self._selected_litter_id,
            self._selected_puppy_id,
        )
        measurement = storage.get_measurement(
            self._selected_litter_id,
            self._selected_puppy_id,
            self._selected_measurement_id,
        )

        if puppy is None:
            return self.async_abort(reason="invalid_puppy")
        if measurement is None:
            return self.async_abort(reason="invalid_measurement")

        if user_input is not None:
            if user_input["confirm"]:
                try:
                    await storage.async_delete_weight(
                        self._selected_litter_id,
                        self._selected_puppy_id,
                        self._selected_measurement_id,
                        reason=user_input.get("reason") or None,
                    )
                    async_dispatcher_send(
                        self.hass, SIGNAL_UPDATE, self._selected_puppy_id
                    )
                    async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)
                except ValueError:
                    return self.async_abort(reason="invalid_measurement")
            return self.async_create_entry(title="", data={})

        return self.async_show_form(
            step_id="confirm_delete_measurement",
            description_placeholders={
                "puppy": puppy.get("name", "Puppy"),
                "measurement": self._measurement_option_label(measurement),
            },
            data_schema=vol.Schema(
                {
                    vol.Optional("reason"): selector.TextSelector(
                        selector.TextSelectorConfig(multiline=True)
                    ),
                    vol.Required("confirm", default=False): selector.BooleanSelector(),
                }
            ),
        )

    async def async_step_integrity(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Run the safe storage integrity checker."""
        if user_input is not None:
            return self.async_create_entry(
                title="",
                data={},
            )

        storage = self._get_storage()
        report = await storage.async_run_integrity_check(
            repair=True,
        )

        async_dispatcher_send(
            self.hass,
            SIGNAL_UPDATE,
            None,
        )
        async_dispatcher_send(
            self.hass,
            SIGNAL_DASHBOARD_UPDATE,
        )

        status = (
            "OK"
            if report.get("healthy", False)
            else "⚠"
        )

        return self.async_show_form(
            step_id="integrity",
            description_placeholders={
                "status": status,
                "issues": str(report.get("issues_found", 0)),
                "repairs": str(report.get("repairs_applied", 0)),
                "critical": str(report.get("unresolved_critical", 0)),
                "warnings": str(report.get("unresolved_warnings", 0)),
                "measurements": str(
                    report.get("checked", {}).get(
                        "measurement_versions",
                        0,
                    )
                ),
            },
            data_schema=vol.Schema({}),
        )

    async def async_step_settings(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure monitoring settings."""

        storage = self._get_storage()
        settings = storage.get_settings()

        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                await storage.async_update_settings(
                    min_daily_growth_percent=(
                        user_input[
                            "min_daily_growth_percent"
                        ]
                    ),
                    max_hours_between_weighings=(
                        user_input[
                            "max_hours_between_weighings"
                        ]
                    ),
                    growth_monitoring_days=(
                        int(
                            user_input[
                                "growth_monitoring_days"
                            ]
                        )
                    ),
                    notifications_enabled=bool(
                        user_input["notifications_enabled"]
                    ),
                    notify_recovery=bool(
                        user_input["notify_recovery"]
                    ),
                    notify_session_complete=bool(
                        user_input["notify_session_complete"]
                    ),
                    notify_entities=list(
                        user_input.get("notify_entities", [])
                    ),
                )

                async_dispatcher_send(
                    self.hass,
                    SIGNAL_UPDATE,
                    None,
                )

            except ValueError:
                errors[
                    "base"
                ] = "invalid_settings"

            except Exception:
                _LOGGER.exception(
                    "Error saving monitoring settings"
                )
                errors[
                    "base"
                ] = "unknown"

            else:
                return self.async_create_entry(
                    title="",
                    data={},
                )

        return self.async_show_form(
            step_id="settings",
            data_schema=vol.Schema(
                {
                    vol.Required(
                        "min_daily_growth_percent",
                        default=settings.get(
                            "min_daily_growth_percent",
                            DEFAULT_MIN_DAILY_GROWTH_PERCENT,
                        ),
                    ): selector.NumberSelector(
                        selector.NumberSelectorConfig(
                            min=0,
                            max=20,
                            step=0.5,
                            unit_of_measurement="%",
                            mode=selector.NumberSelectorMode.BOX,
                        )
                    ),

                    vol.Required(
                        "max_hours_between_weighings",
                        default=settings.get(
                            "max_hours_between_weighings",
                            DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
                        ),
                    ): selector.NumberSelector(
                        selector.NumberSelectorConfig(
                            min=1,
                            max=168,
                            step=1,
                            unit_of_measurement=UnitOfTime.HOURS,
                            mode=selector.NumberSelectorMode.BOX,
                        )
                    ),

                    vol.Required(
                        "growth_monitoring_days",
                        default=settings.get(
                            "growth_monitoring_days",
                            DEFAULT_GROWTH_MONITORING_DAYS,
                        ),
                    ): selector.NumberSelector(
                        selector.NumberSelectorConfig(
                            min=1,
                            max=56,
                            step=1,
                            unit_of_measurement=UnitOfTime.DAYS,
                            mode=selector.NumberSelectorMode.BOX,
                        )
                    ),

                    vol.Required(
                        "notifications_enabled",
                        default=settings.get(
                            "notifications_enabled",
                            DEFAULT_NOTIFICATIONS_ENABLED,
                        ),
                    ): selector.BooleanSelector(),

                    vol.Required(
                        "notify_recovery",
                        default=settings.get(
                            "notify_recovery",
                            DEFAULT_NOTIFY_RECOVERY,
                        ),
                    ): selector.BooleanSelector(),

                    vol.Required(
                        "notify_session_complete",
                        default=settings.get(
                            "notify_session_complete",
                            DEFAULT_NOTIFY_SESSION_COMPLETE,
                        ),
                    ): selector.BooleanSelector(),

                    vol.Optional(
                        "notify_entities",
                        default=settings.get(
                            "notify_entities",
                            list(DEFAULT_NOTIFY_ENTITIES),
                        ),
                    ): selector.EntitySelector(
                        selector.EntitySelectorConfig(
                            domain="notify",
                            multiple=True,
                        )
                    ),
                }
            ),
            errors=errors,
        )