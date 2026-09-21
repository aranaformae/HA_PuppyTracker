"""Config flow entry point with Puppy Tracker data-management extensions."""

from __future__ import annotations

from typing import Any

from homeassistant import config_entries
from homeassistant.config_entries import ConfigEntry, ConfigFlowResult
from homeassistant.core import callback

from . import config_flow_management as _management
from .const import DOMAIN
from .data_management_flow import PuppyTrackerDataManagementMixin
from .mother_data_management import MotherDataManagementMixin
from .notification_settings_flow import NotificationSettingsMixin


class PuppyTrackerOptionsFlow(
    NotificationSettingsMixin,
    MotherDataManagementMixin,
    PuppyTrackerDataManagementMixin,
    _management.PuppyTrackerManagementOptionsFlow,
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
                "notifications",
            ],
        )


class PuppyTrackerConfigFlow(config_entries.ConfigFlow, domain=DOMAIN):
    """Handle initial Puppy Tracker setup."""

    VERSION = 1

    async def async_step_user(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Create the single Puppy Tracker config entry."""
        if self._async_current_entries():
            return self.async_abort(reason="single_instance_allowed")
        await self.async_set_unique_id(DOMAIN, raise_on_progress=False)
        self._abort_if_unique_id_configured()
        if user_input is not None:
            return self.async_create_entry(title="Puppy Tracker", data={})
        return self.async_show_form(step_id="user")

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: ConfigEntry,
    ) -> PuppyTrackerOptionsFlow:
        """Return the complete Puppy Tracker options flow."""
        del config_entry
        return PuppyTrackerOptionsFlow()

__all__ = [
    "PuppyTrackerConfigFlow",
    "PuppyTrackerOptionsFlow",
]
