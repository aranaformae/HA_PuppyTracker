"""Central notification settings for Puppy Tracker options flow."""

from __future__ import annotations

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
    DEFAULT_NOTIFICATION_LEAD_MINUTES,
    DEFAULT_NOTIFY_ENTITIES,
    DEFAULT_NOTIFY_RECOVERY,
    DEFAULT_NOTIFY_SESSION_COMPLETE,
    DEFAULT_RECURRING_REMINDER_NOTIFICATIONS_ENABLED,
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_UPDATE,
)
from .notification_delivery import async_send_notify_entities, normalize_notify_entities


class NotificationSettingsMixin:
    """Expose one central notification settings area in the options flow."""

    async def _async_send_test_notification(self, notify_entities: list[str]) -> None:
        """Send a real test message without touching reminder state."""
        title = "Puppy Tracker · Testmelding"
        message = (
            "Dit is een testmelding van Puppy Tracker. "
            "Je meldingsinstellingen en gekozen ontvangers werken."
        )

        # Explicit tests use the exact same notify.* delivery helper as automatic
        # recurring reminders, but in strict mode so delivery/configuration
        # failures are surfaced to the options flow instead of being swallowed.
        await async_send_notify_entities(
            self.hass,
            notify_entities,
            title,
            message,
            strict=True,
        )

        async_create(
            self.hass,
            message,
            title=title,
            notification_id="puppy_tracker_notification_test",
        )

    async def async_step_settings(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure monitoring thresholds without mixing in delivery settings."""
        storage = self._get_storage()
        settings = storage.get_settings()
        errors: dict[str, str] = {}

        if user_input is not None:
            try:
                await storage.async_update_settings(
                    min_daily_growth_percent=user_input["min_daily_growth_percent"],
                    max_hours_between_weighings=user_input["max_hours_between_weighings"],
                    growth_monitoring_days=int(user_input["growth_monitoring_days"]),
                    notifications_enabled=bool(
                        settings.get("notifications_enabled", DEFAULT_NOTIFICATIONS_ENABLED)
                    ),
                    recurring_reminder_notifications_enabled=bool(
                        settings.get(
                            "recurring_reminder_notifications_enabled",
                            DEFAULT_RECURRING_REMINDER_NOTIFICATIONS_ENABLED,
                        )
                    ),
                    notify_recovery=bool(
                        settings.get("notify_recovery", DEFAULT_NOTIFY_RECOVERY)
                    ),
                    notify_session_complete=bool(
                        settings.get(
                            "notify_session_complete",
                            DEFAULT_NOTIFY_SESSION_COMPLETE,
                        )
                    ),
                    notify_entities=list(
                        settings.get("notify_entities", list(DEFAULT_NOTIFY_ENTITIES))
                    ),
                    notification_lead_minutes=int(
                        settings.get(
                            "notification_lead_minutes",
                            DEFAULT_NOTIFICATION_LEAD_MINUTES,
                        )
                    ),
                )
                async_dispatcher_send(self.hass, SIGNAL_UPDATE, None)
                async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)
            except ValueError:
                errors["base"] = "invalid_settings"
            except Exception:
                errors["base"] = "unknown"
            else:
                return self.async_create_entry(title="", data={})

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
                }
            ),
            errors=errors,
        )

    async def async_step_notifications(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Show the central notification-management menu."""
        del user_input
        return self.async_show_menu(
            step_id="notifications",
            menu_options=[
                "notification_preferences",
                "test_notification",
            ],
        )

    async def async_step_notification_preferences(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Configure every current Puppy Tracker notification preference."""
        storage = self._get_storage()
        settings = storage.get_settings()
        errors: dict[str, str] = {}

        if user_input is not None:
            notify_entities = normalize_notify_entities(
                user_input.get("notify_entities", [])
            )
            try:
                await storage.async_update_settings(
                    min_daily_growth_percent=settings.get(
                        "min_daily_growth_percent",
                        DEFAULT_MIN_DAILY_GROWTH_PERCENT,
                    ),
                    max_hours_between_weighings=settings.get(
                        "max_hours_between_weighings",
                        DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
                    ),
                    growth_monitoring_days=int(
                        settings.get(
                            "growth_monitoring_days",
                            DEFAULT_GROWTH_MONITORING_DAYS,
                        )
                    ),
                    notifications_enabled=bool(user_input["notifications_enabled"]),
                    recurring_reminder_notifications_enabled=bool(
                        user_input["recurring_reminder_notifications_enabled"]
                    ),
                    notify_recovery=bool(user_input["notify_recovery"]),
                    notify_session_complete=bool(
                        user_input["notify_session_complete"]
                    ),
                    notify_entities=notify_entities,
                    notification_lead_minutes=int(
                        user_input["notification_lead_minutes"]
                    ),
                )
                async_dispatcher_send(self.hass, SIGNAL_UPDATE, None)
                async_dispatcher_send(self.hass, SIGNAL_DASHBOARD_UPDATE)
            except ValueError:
                errors["base"] = "invalid_notification_settings"
            except Exception:
                errors["base"] = "unknown"
            else:
                return self.async_create_entry(title="", data={})

        return self.async_show_form(
            step_id="notification_preferences",
            data_schema=vol.Schema(
                {
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
                        "notification_lead_minutes",
                        default=settings.get(
                            "notification_lead_minutes",
                            DEFAULT_NOTIFICATION_LEAD_MINUTES,
                        ),
                    ): selector.NumberSelector(
                        selector.NumberSelectorConfig(
                            min=0,
                            max=10080,
                            step=5,
                            unit_of_measurement=UnitOfTime.MINUTES,
                            mode=selector.NumberSelectorMode.BOX,
                        )
                    ),
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
                }
            ),
            errors=errors,
        )

    async def async_step_test_notification(
        self,
        user_input: dict[str, Any] | None = None,
    ) -> ConfigFlowResult:
        """Send a test through the currently configured notification path."""
        storage = self._get_storage()
        settings = storage.get_settings()
        notify_entities = normalize_notify_entities(
            settings.get("notify_entities", [])
        )
        errors: dict[str, str] = {}

        if user_input is not None and user_input.get("confirm"):
            try:
                await self._async_send_test_notification(notify_entities)
            except Exception:
                errors["base"] = "notification_test_failed"
            else:
                return self.async_create_entry(title="", data={})

        return self.async_show_form(
            step_id="test_notification",
            description_placeholders={
                "targets": str(len(notify_entities)),
            },
            data_schema=vol.Schema(
                {
                    vol.Required("confirm", default=False): selector.BooleanSelector(),
                }
            ),
            errors=errors,
        )
