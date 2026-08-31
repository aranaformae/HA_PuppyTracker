"""Config flow entry point with Puppy Tracker data-management extensions."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigFlowResult

from . import config_flow_management as _management
from .data_management_flow import PuppyTrackerDataManagementMixin
from .mother_data_management import MotherDataManagementMixin
from .notification_settings_flow import NotificationSettingsMixin


class PuppyTrackerOptionsFlow(
    NotificationSettingsMixin,
    MotherDataManagementMixin,
    PuppyTrackerDataManagementMixin,
    _management.PuppyTrackerOptionsFlow,
):
    """Handle Puppy Tracker management, including JSON backup and restore."""

    async def async_step_init(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Show the complete management menu."""
        del user_input
        return self.async_show_menu(
            step_id="init",
            menu_options=[
                "create_litter",
                "manage_litter",
                "add_puppy",
                "manage_puppy",
                "manage_measurements",
                "data_management",
                "integrity",
                "settings",
            ],
        )


# The original config-flow class resolves PuppyTrackerOptionsFlow from its
# defining module at runtime. Point that global at the extended options class,
# then re-export the registered config-flow handler from this canonical module.
_management.PuppyTrackerOptionsFlow = PuppyTrackerOptionsFlow
PuppyTrackerConfigFlow = _management.PuppyTrackerConfigFlow

__all__ = [
    "PuppyTrackerConfigFlow",
    "PuppyTrackerOptionsFlow",
]
