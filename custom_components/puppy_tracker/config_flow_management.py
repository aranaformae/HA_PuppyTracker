"""Config flow and options flow for Puppy Tracker."""

from __future__ import annotations

from homeassistant.util import dt as dt_util

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import (
    ConfigFlowResult,
    OptionsFlow,
)
from homeassistant.helpers import selector
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import (
    DEFAULT_GROWTH_MILESTONES_PERCENT,
    DEFAULT_DOUBLE_WEIGHT_REFERENCE_DAYS,
    DEFAULT_MILESTONE_PROJECTION_MEASUREMENTS,
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
from .dog_identity import DEFAULT_DOG_BREED
from .measurements import measurement_status
from .runtime import PuppyTrackerRuntimeData
from .storage import PuppyTrackerStorage
from .time_utils import (
    current_selector_datetime,
    format_local_timestamp,
    normalize_timestamp,
    selector_datetime_value,
)

_LOGGER = logging.getLogger(__name__)


def _optional_suggested_value(key: str, value: Any) -> Any:
    """Return an optional field with a clearable existing value."""
    if value in (None, ""):
        return vol.Optional(key)
    return vol.Optional(key, description={"suggested_value": value})


class PuppyTrackerManagementOptionsFlow(
    OptionsFlow
):
    """Handle Puppy Tracker management."""

    def _get_storage(
        self,
    ) -> PuppyTrackerStorage:
        """Return integration storage."""

        runtime = self.config_entry.runtime_data
        if not isinstance(runtime, PuppyTrackerRuntimeData):
            raise RuntimeError("Puppy Tracker is not loaded")
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
                    mother_details={
                        "registered_name": user_input.get("mother_registered_name"),
                        "birth_date": user_input.get("mother_birth_date"),
                        "breed": user_input.get("mother_breed"),
                        "wala_number": user_input.get("mother_wala_number"),
                        "chip_number": user_input.get("mother_chip_number"),
                    },
                    father_details={
                        "registered_name": user_input.get("father_registered_name"),
                        "birth_date": user_input.get("father_birth_date"),
                        "breed": user_input.get("father_breed"),
                        "wala_number": user_input.get("father_wala_number"),
                        "chip_number": user_input.get("father_chip_number"),
                    },
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
                        "mother_registered_name"
                    ): selector.TextSelector(),

                    vol.Optional(
                        "mother_birth_date"
                    ): selector.DateSelector(),

                    vol.Optional(
                        "mother_breed",
                        default=DEFAULT_DOG_BREED,
                    ): selector.TextSelector(),

                    vol.Optional(
                        "mother_wala_number"
                    ): selector.TextSelector(),
                    vol.Optional("mother_chip_number"): selector.TextSelector(),

                    vol.Optional(
                        "father"
                    ): selector.TextSelector(),

                    vol.Optional(
                        "father_registered_name"
                    ): selector.TextSelector(),

                    vol.Optional(
                        "father_birth_date"
                    ): selector.DateSelector(),

                    vol.Optional(
                        "father_breed",
                        default=DEFAULT_DOG_BREED,
                    ): selector.TextSelector(),

                    vol.Optional(
                        "father_wala_number"
                    ): selector.TextSelector(),
                    vol.Optional("father_chip_number"): selector.TextSelector(),
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

        mother_profile = (
            storage.get_mother_for_litter(self._selected_litter_id)
            if hasattr(storage, "get_mother_for_litter")
            else None
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
                        mother_details={
                            "registered_name": user_input.get("mother_registered_name"),
                            "birth_date": user_input.get("mother_birth_date"),
                            "breed": user_input.get("mother_breed"),
                            "wala_number": user_input.get("mother_wala_number"),
                            "chip_number": user_input.get("mother_chip_number"),
                        },
                        father_details={
                            "registered_name": user_input.get("father_registered_name"),
                            "birth_date": user_input.get("father_birth_date"),
                            "breed": user_input.get("father_breed"),
                            "wala_number": user_input.get("father_wala_number"),
                            "chip_number": user_input.get("father_chip_number"),
                        },
                        growth_analysis={
                            "breed_profile": user_input.get("breed_profile") or "unknown",
                            "size_class": user_input.get("size_class") or "unknown",
                            "min_daily_growth_percent": user_input.get("min_daily_growth_percent"),
                            "max_hours_between_weighings": user_input.get("max_hours_between_weighings"),
                            "growth_monitoring_days": user_input.get("growth_monitoring_days"),
                            "first_day_max_weight_loss_percent": user_input.get("first_day_max_weight_loss_percent"),
                            "expected_adult_weight_min_grams": user_input.get("expected_adult_weight_min_grams"),
                            "expected_adult_weight_max_grams": user_input.get("expected_adult_weight_max_grams"),
                            "growth_milestones_percent": user_input.get("growth_milestones_percent"),
                            "double_weight_reference_days": user_input.get("double_weight_reference_days"),
                            "milestone_projection_measurements": user_input.get("milestone_projection_measurements"),
                        },
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
                        litter,
                        mother_profile,
                    ),
                    errors={
                        "base": "unknown"
                    },
                )

        return self.async_show_form(
            step_id="edit_litter",
            data_schema=self._litter_edit_schema(
                litter,
                mother_profile,
            ),
        )

    def _litter_edit_schema(
        self,
        litter: dict[str, Any],
        mother_profile: dict[str, Any] | None = None,
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

        fields[_optional_suggested_value("birth_date", litter.get("birth_date"))] = (
            selector.DateSelector()
        )
        fields[_optional_suggested_value("mother", litter.get("mother"))] = (
            selector.TextSelector()
        )

        mother_identity = mother_profile or {}
        fields[
            _optional_suggested_value(
                "mother_registered_name",
                mother_identity.get("registered_name"),
            )
        ] = selector.TextSelector()

        fields[
            _optional_suggested_value("mother_birth_date", mother_identity.get("birth_date"))
        ] = selector.DateSelector()

        fields[
            _optional_suggested_value(
                "mother_breed",
                mother_identity.get("breed") or DEFAULT_DOG_BREED,
            )
        ] = selector.TextSelector()
        fields[
            _optional_suggested_value(
                "mother_wala_number",
                mother_identity.get("wala_number"),
            )
        ] = selector.TextSelector()
        fields[
            _optional_suggested_value("mother_chip_number", mother_identity.get("chip_number"))
        ] = selector.TextSelector()

        fields[
            _optional_suggested_value("father", litter.get("father"))
        ] = selector.TextSelector()

        father_identity = litter.get("father_details") or {}
        fields[
            _optional_suggested_value(
                "father_registered_name",
                father_identity.get("registered_name"),
            )
        ] = selector.TextSelector()

        fields[
            _optional_suggested_value("father_birth_date", father_identity.get("birth_date"))
        ] = selector.DateSelector()

        fields[
            _optional_suggested_value(
                "father_breed",
                father_identity.get("breed") or DEFAULT_DOG_BREED,
            )
        ] = selector.TextSelector()
        fields[
            _optional_suggested_value(
                "father_wala_number",
                father_identity.get("wala_number"),
            )
        ] = selector.TextSelector()
        fields[
            _optional_suggested_value("father_chip_number", father_identity.get("chip_number"))
        ] = selector.TextSelector()

        growth = litter.get("growth_analysis") or {}
        fields[
            vol.Optional("breed_profile", default=growth.get("breed_profile", "unknown"))
        ] = selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=["unknown", "labradoodle", "australian_labradoodle"],
                translation_key="litter_breed_profile",
            )
        )
        fields[
            vol.Optional("size_class", default=growth.get("size_class", "unknown"))
        ] = selector.SelectSelector(
            selector.SelectSelectorConfig(
                options=["unknown", "miniature", "medium", "standard"],
                translation_key="litter_size_class",
            )
        )

        raw_milestones = growth.get(
            "growth_milestones_percent",
            DEFAULT_GROWTH_MILESTONES_PERCENT,
        )
        if raw_milestones in (None, ""):
            raw_milestones = DEFAULT_GROWTH_MILESTONES_PERCENT
        milestone_value = (
            ", ".join(str(value) for value in raw_milestones)
            if isinstance(raw_milestones, (list, tuple))
            else str(raw_milestones)
        )
        fields[
            _optional_suggested_value(
                "growth_milestones_percent",
                milestone_value,
            )
        ] = selector.TextSelector()

        for key, minimum, maximum, step, fallback in (
            ("min_daily_growth_percent", 0, 20, 0.1, None),
            ("max_hours_between_weighings", 1, 168, 1, None),
            ("growth_monitoring_days", 1, 56, 1, None),
            ("first_day_max_weight_loss_percent", 0, 50, 0.1, None),
            ("expected_adult_weight_min_grams", 1, 100000, 1, None),
            ("expected_adult_weight_max_grams", 1, 100000, 1, None),
            (
                "double_weight_reference_days",
                1,
                56,
                1,
                DEFAULT_DOUBLE_WEIGHT_REFERENCE_DAYS,
            ),
            (
                "milestone_projection_measurements",
                2,
                8,
                1,
                DEFAULT_MILESTONE_PROJECTION_MEASUREMENTS,
            ),
        ):
            fields[
                _optional_suggested_value(
                    key,
                    growth.get(key, fallback),
                )
            ] = (
                selector.NumberSelector(
                    selector.NumberSelectorConfig(
                        min=minimum,
                        max=maximum,
                        step=step,
                        mode=selector.NumberSelectorMode.BOX,
                    )
                )
            )

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
                    registered_name=user_input.get(
                        "registered_name"
                    ),
                    collar_color=user_input.get(
                        "collar_color"
                    ),
                    coat_color=user_input.get(
                        "coat_color"
                    ),
                    breed=user_input.get(
                        "breed"
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
                    profile_note=user_input.get(
                        "profile_note"
                    ),
                    chip_number=user_input.get("chip_number"),
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
                        "registered_name"
                    ): selector.TextSelector(),

                    vol.Optional(
                        "coat_color"
                    ): selector.TextSelector(),

                    vol.Optional(
                        "collar_color"
                    ): selector.TextSelector(),

                    vol.Optional(
                        "breed",
                        default=DEFAULT_DOG_BREED,
                    ): selector.TextSelector(),

                    vol.Optional(
                        "chip_number"
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
                        "profile_note"
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
                    birth_time = user_input.get("birth_time")
                    if birth_time and birth_time == selector_datetime_value(
                        puppy.get("birth_time")
                    ):
                        # The selector omits fractions of seconds from stored times.
                        birth_time = puppy.get("birth_time")
                    await storage.async_update_puppy(
                        self._selected_litter_id,
                        self._selected_puppy_id,
                        name=user_input[
                            "name"
                        ],
                        registered_name=user_input.get(
                            "registered_name"
                        ),
                        collar_color=user_input.get(
                            "collar_color"
                        ),
                        coat_color=user_input.get(
                            "coat_color"
                        ),
                        breed=user_input.get(
                            "breed"
                        ),
                        sex=user_input.get(
                            "sex"
                        ),
                        birth_weight=user_input.get(
                            "birth_weight"
                        ),
                        birth_time=birth_time,
                        profile_note=user_input.get(
                            "profile_note"
                        ),
                        chip_number=user_input.get("chip_number"),
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

            _optional_suggested_value("registered_name", puppy.get("registered_name")):
                selector.TextSelector(),

            _optional_suggested_value("coat_color", puppy.get("coat_color")):
                selector.TextSelector(),

            _optional_suggested_value("collar_color", puppy.get("collar_color")):
                selector.TextSelector(),

            _optional_suggested_value(
                "breed",
                puppy.get("breed") or DEFAULT_DOG_BREED,
            ): selector.TextSelector(),
        }

        sex = puppy.get(
            "sex"
        )

        if sex:
            fields[
                _optional_suggested_value("sex", sex)
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
                _optional_suggested_value("birth_weight", birth_weight)
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
                _optional_suggested_value(
                    "birth_time",
                    selector_datetime_value(birth_time),
                )
            ] = selector.DateTimeSelector()
        else:
            fields[
                vol.Optional(
                    "birth_time"
                )
            ] = selector.DateTimeSelector()

        fields[
            _optional_suggested_value(
                "profile_note",
                puppy.get("profile_note"),
            )
        ] = selector.TextSelector(
            selector.TextSelectorConfig(
                multiline=True
            )
        )

        fields[
            _optional_suggested_value("chip_number", puppy.get("chip_number"))
        ] = selector.TextSelector()

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
                    entered_timestamp = user_input["timestamp"]
                    normalized_entered_timestamp = normalize_timestamp(entered_timestamp)
                    original_selector_timestamp = selector_datetime_value(
                        measurement.get("timestamp")
                    )
                    normalized_original_display_timestamp = normalize_timestamp(
                        original_selector_timestamp
                    )
                    if normalized_entered_timestamp is None:
                        raise ValueError("Timestamp is invalid")

                    # Compare against the precision actually shown by the selector.
                    # If only the weight changes, preserve the exact stored instant,
                    # including any fractional seconds that the UI does not expose.
                    timestamp_changed = (
                        normalized_entered_timestamp
                        != normalized_original_display_timestamp
                    )
                    changed = (
                        new_weight != float(measurement["weight"])
                        or timestamp_changed
                    )
                    if changed:
                        await storage.async_correct_measurement(
                            self._selected_litter_id,
                            self._selected_puppy_id,
                            self._selected_measurement_id,
                            new_weight=new_weight,
                            new_timestamp=(
                                normalized_entered_timestamp if timestamp_changed else None
                            ),
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
