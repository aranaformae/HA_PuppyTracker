"""Puppy Tracker integration."""

from __future__ import annotations

import logging

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .api import async_setup_api
from .care_reminders import CareReminderStore
from .const import (
    DOMAIN,
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_NEW_LITTER,
    SIGNAL_NEW_PUPPY,
    SIGNAL_UPDATE,
)
from .devices import async_sync_devices
from .frontend import async_setup_frontend, async_unload_frontend
from .mother_api import async_setup_mother_api
from .mother_storage_integrity import MotherScopeIntegrityStorage
from .notifications import PuppyNotificationManager
from .recurring_notifications import RecurringReminderNotificationManager
from .recurring_reminder_api import async_setup_recurring_reminder_api
from .recurring_reminders import RecurringReminderStore
from .runtime import (
    PuppyTrackerRuntimeData,
    reconcile_dashboard_selection,
)
from .session import (
    get_session,
    mark_weight_recorded,
)


_LOGGER = logging.getLogger(__name__)


PLATFORMS: tuple[Platform, ...] = (
    Platform.SENSOR,
    Platform.BINARY_SENSOR,
    Platform.SELECT,
    Platform.NUMBER,
    Platform.SWITCH,
    Platform.BUTTON,
)


SERVICE_CREATE_LITTER = "create_litter"
SERVICE_ADD_PUPPY = "add_puppy"
SERVICE_RECORD_WEIGHT = "record_weight"

SERVICES = (
    SERVICE_CREATE_LITTER,
    SERVICE_ADD_PUPPY,
    SERVICE_RECORD_WEIGHT,
)


CREATE_LITTER_SCHEMA = vol.Schema(
    {
        vol.Required("name"): cv.string,
        vol.Optional("birth_date"): cv.string,
        vol.Optional("mother"): cv.string,
        vol.Optional("father"): cv.string,
    }
)


ADD_PUPPY_SCHEMA = vol.Schema(
    {
        vol.Required("litter_id"): cv.string,
        vol.Required("name"): cv.string,
        vol.Optional("collar_color"): cv.string,
        vol.Optional("sex"): cv.string,
        vol.Optional("birth_weight"): vol.All(
            vol.Coerce(float),
            vol.Range(min=1, max=5000),
        ),
        vol.Optional("birth_time"): cv.string,
        vol.Optional("profile_note"): cv.string,
    }
)


RECORD_WEIGHT_SCHEMA = vol.Schema(
    {
        vol.Required("litter_id"): cv.string,
        vol.Required("puppy_id"): cv.string,
        vol.Required("weight"): vol.All(
            vol.Coerce(float),
            vol.Range(min=1, max=10000),
        ),
        vol.Optional("timestamp"): cv.string,
        vol.Optional("note"): cv.string,
    }
)


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Puppy Tracker."""
    storage = MotherScopeIntegrityStorage(hass)
    await storage.async_load()

    integrity_report = storage.get_integrity_report()
    if integrity_report.get("unresolved_critical", 0):
        _LOGGER.warning(
            "Puppy Tracker storage integrity check found %s unresolved critical issue(s); "
            "download integration diagnostics for details",
            integrity_report.get("unresolved_critical", 0),
        )
    elif integrity_report.get("repairs_applied", 0):
        _LOGGER.info(
            "Puppy Tracker safely repaired %s storage integrity issue(s) during startup",
            integrity_report.get("repairs_applied", 0),
        )

    care_reminders = CareReminderStore(hass)
    await care_reminders.async_load()
    recurring_reminders = RecurringReminderStore(hass)
    await recurring_reminders.async_load()

    runtime = PuppyTrackerRuntimeData(
        storage=storage,
        care_reminders=care_reminders,
        recurring_reminders=recurring_reminders,
    )
    reconcile_dashboard_selection(runtime)
    entry.runtime_data = runtime

    async_setup_api(hass)
    async_setup_mother_api(hass)
    async_setup_recurring_reminder_api(hass)
    await async_setup_frontend(hass)

    async_sync_devices(hass, entry, storage.get_data())
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    notification_manager = PuppyNotificationManager(hass, entry, storage, runtime)
    runtime.notification_manager = notification_manager
    await notification_manager.async_start()

    recurring_notification_manager = RecurringReminderNotificationManager(hass, entry, runtime)
    runtime.recurring_notification_manager = recurring_notification_manager
    await recurring_notification_manager.async_start()

    async def handle_create_litter(call: ServiceCall) -> None:
        """Create a litter."""
        litter_id = await storage.async_create_litter(
            name=call.data["name"],
            birth_date=call.data.get("birth_date"),
            mother=call.data.get("mother"),
            father=call.data.get("father"),
        )
        async_sync_devices(hass, entry, storage.get_data())
        async_dispatcher_send(hass, SIGNAL_NEW_LITTER, litter_id)
        async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
        _LOGGER.info("Created puppy litter '%s' with id %s", call.data["name"], litter_id)

    async def handle_add_puppy(call: ServiceCall) -> None:
        """Add a puppy."""
        puppy_id = await storage.async_add_puppy(
            litter_id=call.data["litter_id"],
            name=call.data["name"],
            birth_weight=call.data.get("birth_weight"),
            birth_time=call.data.get("birth_time"),
            collar_color=call.data.get("collar_color"),
            sex=call.data.get("sex"),
            profile_note=call.data.get("profile_note"),
        )
        async_sync_devices(hass, entry, storage.get_data())
        async_dispatcher_send(hass, SIGNAL_NEW_PUPPY, call.data["litter_id"], puppy_id)
        async_dispatcher_send(hass, SIGNAL_UPDATE, puppy_id)
        async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
        _LOGGER.info("Added puppy '%s' with id %s", call.data["name"], puppy_id)

    async def handle_record_weight(call: ServiceCall) -> None:
        """Record puppy weight."""
        litter_id = call.data["litter_id"]
        puppy_id = call.data["puppy_id"]
        weight = float(call.data["weight"])
        puppy = storage.get_puppy(litter_id, puppy_id)
        if puppy is None:
            raise ValueError("The specified puppy does not exist in this litter")

        measurement_id = await storage.async_record_weight(
            litter_id=litter_id,
            puppy_id=puppy_id,
            weight=weight,
            timestamp=call.data.get("timestamp"),
            note=call.data.get("note"),
        )
        session_completed = mark_weight_recorded(
            runtime,
            litter_id=litter_id,
            puppy_id=puppy_id,
            puppy_name=puppy.get("name", "Puppy"),
            weight=weight,
        )
        if session_completed:
            await storage.async_record_completed_weighing_session(litter_id, get_session(runtime))
        async_dispatcher_send(hass, SIGNAL_UPDATE, puppy_id)
        async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
        _LOGGER.info(
            "Recorded weight %.1f g for puppy '%s' (measurement %s)",
            weight,
            puppy.get("name", puppy_id),
            measurement_id,
        )

    for service, handler, schema in (
        (SERVICE_CREATE_LITTER, handle_create_litter, CREATE_LITTER_SCHEMA),
        (SERVICE_ADD_PUPPY, handle_add_puppy, ADD_PUPPY_SCHEMA),
        (SERVICE_RECORD_WEIGHT, handle_record_weight, RECORD_WEIGHT_SCHEMA),
    ):
        if hass.services.has_service(DOMAIN, service):
            continue
        hass.services.async_register(DOMAIN, service, handler, schema=schema)

    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload Puppy Tracker."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if not unload_ok:
        return False

    runtime = entry.runtime_data
    if isinstance(runtime, PuppyTrackerRuntimeData):
        notification_manager = runtime.notification_manager
        if notification_manager is not None:
            await notification_manager.async_stop()
        recurring_notification_manager = runtime.recurring_notification_manager
        if recurring_notification_manager is not None:
            await recurring_notification_manager.async_stop()

    async_unload_frontend(hass)
    for service in SERVICES:
        if hass.services.has_service(DOMAIN, service):
            hass.services.async_remove(DOMAIN, service)

    entry.runtime_data = None
    return True
