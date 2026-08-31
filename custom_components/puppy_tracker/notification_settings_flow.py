"""Central notification settings for Puppy Tracker options flow."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

import voluptuous as vol

from homeassistant.components.persistent_notification import async_create
from homeassistant.config_entries import ConfigFlowResult
from homeassistant.const import UnitOfTime
from homeassistant.helpers import selector
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import (
    DEFAULT_GROWTH_MONITORING_DAYS,
    DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
    DEFAULT_MIN_DAILY_GROWTH_PERCENT,
    DEFAULT_NOTIFICATIONS_ENABLED,
    DEFAULT_NOTIFY_ENTITIES,
    DEFAULT_NOTIFY_RECOVERY,
    DEFAULT_NOTIFY_SESSION_COMPLETE,
    DEFAULT_RECURRING_REMINDER_NOTIFICATIONS_ENABLED,
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_UPDATE,
)


class NotificationSettingsMixin:
    """Expose all notification delivery preferences from one options step."""

    async def _async_store_recurring_notification_setting(self, enabled: bool) -> None:
        """Persist the recurring-reminder delivery toggle alongside existing settings.

        The main storage method predates generic recurring reminders and rewrites the
        legacy settings dictionary. Keep this extension isolated until the settings
        model is consolidated in a later storage-schema cleanup.
        """
        storage = self._get_storage()
        async with storage._lock:  # noqa: SLF001 - transitional storage extension
            before = deepcopy(storage._data.get("settings", {}))  # noqa: SLF001
            storage._data.setdefault("settings", {})[  # noqa: SLF001
                "recurring_reminder_notifications_enabled"
            ] = bool(enabled)
            storage._add_audit_entry(  # noqa: SLF001
                action="update_notification_settings",
                details={
                    "before": before,
                    "after": deepcopy(storage._data.get("settings", {})),  # noqa: SLF001
                },
            )
            await storage.async_save()

    async def _async_send_test_notification(self, notify_entities: list[str]) -> None:
        """Send a real test message without touching any reminder state."""
        title = "Puppy Tracker · Testmelding"
        message = (
            "Dit is een testmelding van Puppy Tracker. "
            "Je meldinginstellingen en gekozen ontvangers werken."
        )
        async_create(
            self.hass,
            message,
            title=title,
            notification_id="puppy_tracker_notification_test",
        )

        if not self.hass.services.has_service("notify", "send_message"):
            if notify_entities:
                raise ValueError("notify service is unavailable")
            return

        for entity_id in notify_entities:
            await self.hass.services.async_call(
                "notify",
                "send_message",
                {
                    "entity_id": entity_id,
                    "title": title,
                    "message": message,
                },
                blocking=True,
            )

    async def async_step_settings(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure monitoring and all notification preferences in one place."""
        storage = self._get_storage()
        settings = storage.get_settings()
        errors: dict[str, str] = {}
        description_placeholders: dict[str, str] = {}

        if user_input is not None:
            notify_entities = [
                str(entity_id)
                for entity_id in user_input.get("notify_entities", [])
                if str(entity_id).startswith("notify.")
            ]
            try:
                await storage.async_update_settings(
                    min_daily_growth_percent=user_input["min_daily_growth_percent"],
                    max_hours_between_weighings=user_input["max_hours_between_weighings"],
                    growth_monitoring_days=int(user_input["growth_monitoring_days"]),
                    notifications_enabled=bool(user_input["notifications_enabled"]),
                    notify_recovery=bool(user_input["notify_recovery"]),
                    notify_session_complete=bool(user_input["notify_session_complete"]),
                    notify_entities=notify_entities,
                )
                await self._async_store_recurring_notification_setting(
                    bool(user_input["recurring_reminder_notifications_enabled"])
                )

                if bool(user_input.get("send_test_notification", False)):
                    await self._async_send_test_notification(notify_entities)
                    description_placeholders["test_result"] = "Testmelding verzonden."

                async_dispatcher_send(self.hass, SIGNAL_UPDATE, None)
                async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)
            except ValueError:
                errors["base"] = "invalid_notification_settings"
            except Exception:
                errors["base"] = "notification_test_failed"
            else:
                if not user_input.get("send_test_notification", False):
                    return self.async_create_entry(title="", data={})
                settings = storage.get_settings()

        return self.async_show_form(
            step_id="settings",
            description_placeholders=description_placeholders,
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
                        "recurring_reminder_notifications_enabled",
                        default=settings.get(
                            "recurring_reminder_notifications_enabled",
                            DEFAULT_RECURRING_REMINDER_NOTIFICATIONS_ENABLED,
                        ),
                    ): selector.BooleanSelector(),
                    vol.Required(
                        "notify_recovery",
                        default=settings.get("notify_recovery", DEFAULT_NOTIFY_RECOVERY),
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
                        selector.EntitySelectorConfig(domain="notify", multiple=True)
                    ),
                    vol.Required(
                        "send_test_notification",
                        default=False,
                    ): selector.BooleanSelector(),
                }
            ),
            errors=errors,
        )
