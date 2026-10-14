"""One integration-wide breeder form for PDF branding."""

from typing import Any

import voluptuous as vol
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.helpers import selector
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import SIGNAL_DASHBOARD_UPDATE


class BreederSettingsMixin:
    """Manage breeder identity separately from report presentation."""

    async def async_step_breeder(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        storage = self._get_storage()
        errors = {}
        if user_input is not None:
            try:
                await storage.async_update_breeder(
                    {key: user_input.get(key, "") for key in ("name", "contact", "logo_url")}
                )
            except ValueError:
                errors["base"] = "invalid_breeder"
            except Exception:
                errors["base"] = "unknown"
            else:
                async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)
                return self.async_create_entry(title="", data={})
        values = user_input if user_input is not None else storage.get_breeder()
        return self.async_show_form(
            step_id="breeder",
            data_schema=vol.Schema({
                vol.Optional(key, description={"suggested_value": values.get(key, "")}): selector.TextSelector(
                    selector.TextSelectorConfig(multiline=key == "contact")
                )
                for key in ("name", "contact", "logo_url")
            }),
            errors=errors,
        )
