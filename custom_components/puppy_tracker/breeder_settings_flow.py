"""One integration-wide breeder form for PDF branding."""

from typing import Any
from urllib.parse import quote

import voluptuous as vol
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.components.file_upload import process_uploaded_file
from homeassistant.helpers import selector
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import SIGNAL_DASHBOARD_UPDATE
from .breeder import CONTRACT_BREEDER_FIELDS
from .managed_files import MAX_UPLOAD_BYTES
from .managed_files_http import signed_file_path


class BreederSettingsMixin:
    """Manage breeder identity separately from report presentation."""

    async def async_step_breeder(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        storage = self._get_storage()
        errors = {}
        if user_input is not None:
            try:
                if user_input.get("logo_upload") and user_input.get("remove_logo"):
                    raise ValueError("Choose upload or remove")
                logo_content = None
                if user_input.get("logo_upload"):
                    def read_upload() -> bytes:
                        with process_uploaded_file(self.hass, user_input["logo_upload"]) as path:
                            if path.stat().st_size > MAX_UPLOAD_BYTES:
                                raise ValueError("Logo exceeds upload limit")
                            return path.read_bytes()
                    logo_content = await self.hass.async_add_executor_job(read_upload)
                breeder = {key: user_input.get(key, "") for key in ("name", "contact", "logo_url")}
                breeder.update({key: user_input.get(key, "") for key in CONTRACT_BREEDER_FIELDS})
                current_id = storage.get_breeder().get("logo_file_id")
                if current_id and not user_input.get("remove_logo"):
                    breeder["logo_file_id"] = current_id
                await storage.async_update_breeder(
                    breeder, logo_content=logo_content,
                )
            except ValueError:
                errors["base"] = "invalid_logo" if user_input.get("logo_upload") or user_input.get("remove_logo") else "invalid_breeder"
            except Exception:
                errors["base"] = "logo_save_failed" if user_input.get("logo_upload") else "unknown"
            else:
                async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)
                return self.async_create_entry(title="", data={})
        values = user_input if user_input is not None else storage.get_breeder()
        current = storage.get_breeder()
        logo_path = signed_file_path(self.hass, current["logo_file_id"]) if current.get("logo_file_id") else current["logo_url"]
        source_key = (
            "upload" if current.get("logo_file_id") else
            "path" if current.get("logo_url") else "built-in"
        )
        logo_source = {
            "upload": ("Geüpload logo", "Uploaded logo"),
            "path": ("Lokaal logopad", "Local logo path"),
            "built-in": ("Ingebouwd Puppy Tracker-logo", "Built-in Puppy Tracker logo"),
        }[source_key][0 if self.hass.config.language == "nl" else 1]
        schema = {
            vol.Optional(key, description={"suggested_value": values.get(key, "")}): selector.TextSelector(
                selector.TextSelectorConfig(multiline=key == "contact")
            ) for key in ("name", "contact", *CONTRACT_BREEDER_FIELDS, "logo_url")
        }
        schema[vol.Optional("logo_upload")] = selector.FileSelector(selector.FileSelectorConfig(accept=".png,.jpg,.jpeg,image/png,image/jpeg"))
        schema[vol.Optional("remove_logo", default=False)] = selector.BooleanSelector()
        return self.async_show_form(
            step_id="breeder",
            data_schema=vol.Schema(schema),
            description_placeholders={
                "logo_preview": f"![Logo]({quote(logo_path, safe='/?:=&')})" if logo_path else "",
                "logo_source": logo_source,
            },
            errors=errors,
        )
