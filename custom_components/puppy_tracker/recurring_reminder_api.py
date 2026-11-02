"""WebSocket API and reconciliation for generic recurring reminders."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE
from .recurring_reminders import (
    RecurringReminderStore,
    validate_reminder_owner as _validate_owner,
)
from .recurring_reminder_view import async_reminder_items
from .runtime import get_runtime_data, get_runtime_storage
from .updates import dispatch_dossier_update

DATA_API_REGISTERED = f"{DOMAIN}_recurring_reminder_api_registered"


def _store_or_error(hass: HomeAssistant, connection, msg) -> RecurringReminderStore | None:
    runtime = get_runtime_data(hass)
    store = getattr(runtime, "recurring_reminders", None) if runtime is not None else None
    if not isinstance(store, RecurringReminderStore):
        connection.send_error(msg["id"], "not_loaded", "Recurring reminders are not loaded")
        return None
    return store


async def async_reconcile_recurring_reminders(hass: HomeAssistant, *, litter_id: str | None = None) -> None:
    """Advance reminders from matching dossier records without owner cross-talk."""
    runtime = get_runtime_data(hass)
    storage = get_runtime_storage(hass)
    store = getattr(runtime, "recurring_reminders", None) if runtime is not None else None
    if storage is None or not isinstance(store, RecurringReminderStore):
        return

    await store.async_reconcile_records(storage, litter_id=litter_id)


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/recurring_reminders",
    vol.Optional("litter_id"): str,
})
@websocket_api.async_response
async def websocket_list_reminders(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    storage = get_runtime_storage(hass)
    if store is None or storage is None:
        return
    items = await async_reminder_items(store, storage, litter_id=msg.get("litter_id"))
    connection.send_result(msg["id"], {"reminders": items})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/recurring_reminder/create",
    vol.Required("litter_id"): str,
    vol.Required("owner_scope"): vol.In(("litter", "mother", "puppy")),
    vol.Optional("owner_id"): str,
    vol.Required("title"): str,
    vol.Required("record_type"): str,
    vol.Optional("match_title"): vol.Any(str, None),
    vol.Required("schedule_mode"): vol.In(("interval", "fixed_times", "once")),
    vol.Optional("interval_minutes"): vol.Coerce(int),
    vol.Optional("fixed_times"): [str],
    vol.Optional("start_at"): str,
    vol.Optional("due_at"): str,
    vol.Optional("enabled", default=True): bool,
    vol.Optional("notification_lead_minutes"): vol.Any(vol.Coerce(int), None),
})
@websocket_api.async_response
async def websocket_create_reminder(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    storage = get_runtime_storage(hass)
    if store is None or storage is None:
        return
    data = dict(msg)
    data.pop("id", None)
    data.pop("type", None)
    if data.get("owner_scope") == "litter":
        data["owner_id"] = data["litter_id"]
    try:
        _validate_owner(storage, data)
        reminder_id = await store.async_create(data)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_reminder", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True, "reminder_id": reminder_id})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/recurring_reminder/update",
    vol.Required("reminder_id"): str,
    vol.Optional("litter_id"): str,
    vol.Optional("owner_scope"): vol.In(("litter", "mother", "puppy")),
    vol.Optional("owner_id"): str,
    vol.Optional("title"): str,
    vol.Optional("record_type"): str,
    vol.Optional("match_title"): vol.Any(str, None),
    vol.Optional("schedule_mode"): vol.In(("interval", "fixed_times", "once")),
    vol.Optional("interval_minutes"): vol.Coerce(int),
    vol.Optional("fixed_times"): [str],
    vol.Optional("start_at"): str,
    vol.Optional("due_at"): str,
    vol.Optional("enabled"): bool,
    vol.Optional("notification_lead_minutes"): vol.Any(vol.Coerce(int), None),
})
@websocket_api.async_response
async def websocket_update_reminder(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    storage = get_runtime_storage(hass)
    if store is None or storage is None:
        return
    current = store.get_reminder(msg["reminder_id"])
    if current is None:
        connection.send_error(msg["id"], "not_found", "Unknown reminder")
        return
    updates = {key: value for key, value in msg.items() if key not in {"id", "type", "reminder_id"}}
    candidate = {**current, **updates}
    if candidate.get("owner_scope") == "litter":
        candidate["owner_id"] = candidate["litter_id"]
    try:
        _validate_owner(storage, candidate)
        await store.async_update(msg["reminder_id"], candidate)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_reminder", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/recurring_reminder/delete",
    vol.Required("reminder_id"): str,
})
@websocket_api.async_response
async def websocket_delete_reminder(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    if store is None:
        return
    try:
        await store.async_delete(msg["reminder_id"])
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/recurring_reminder/record",
    vol.Required("reminder_id"): str,
    vol.Required("due_at"): str,
    vol.Required("expected_updated_at"): str,
    vol.Required("occurred_at"): str,
    vol.Optional("title"): vol.Any(str, None),
    vol.Optional("note"): vol.Any(str, None),
    vol.Optional("data", default={}): dict,
    vol.Optional("expected_context"): {
        vol.Required("litter_id"): str,
        vol.Required("owner_scope"): vol.In(("litter", "mother", "puppy")),
        vol.Required("record_type"): str,
        vol.Optional("puppy_id"): vol.Any(str, None),
    },
})
@websocket_api.async_response
async def websocket_record_reminder(hass, connection, msg) -> None:
    """Create a care fact, never edit the reminder definition or an earlier fact."""
    store = _store_or_error(hass, connection, msg)
    storage = get_runtime_storage(hass)
    if store is None or storage is None:
        return
    try:
        result = await store.async_record_completion(storage, msg["reminder_id"],
            due_at=msg["due_at"], expected_updated_at=msg["expected_updated_at"], occurred_at=msg["occurred_at"],
            title=msg.get("title"), note=msg.get("note"), data=msg.get("data"),
            expected_context=msg.get("expected_context"))
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_reminder", str(err))
        return
    record = result["record"]
    dispatch_dossier_update(hass, record.get("puppy_id"))
    connection.send_result(msg["id"], {"ok": True, **result})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/recurring_reminder/undo",
    vol.Required("reminder_id"): str,
    vol.Required("record_id"): str,
    vol.Required("expected_record_updated_at"): str,
})
@websocket_api.async_response
async def websocket_undo_reminder(hass, connection, msg) -> None:
    """Soft-delete a just-saved execution; derive planning again from history."""
    store = _store_or_error(hass, connection, msg)
    storage = get_runtime_storage(hass)
    if store is None or storage is None:
        return
    try:
        record = await store.async_undo_completion(storage, msg["reminder_id"], record_id=msg["record_id"],
            expected_record_updated_at=msg["expected_record_updated_at"])
    except ValueError as err:
        connection.send_error(msg["id"], "stale_execution", str(err))
        return
    dispatch_dossier_update(hass, record.get("puppy_id"))
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/recurring_reminder/postpone",
    vol.Required("reminder_id"): str,
    vol.Required("due_at"): str,
    vol.Required("expected_updated_at"): str,
    vol.Required("until"): vol.Any(str, None),
})
@websocket_api.async_response
async def websocket_postpone_reminder(hass, connection, msg) -> None:
    """Postpone only the pending moment, or cancel its postponement with null."""
    store = _store_or_error(hass, connection, msg)
    storage = get_runtime_storage(hass)
    if store is None or storage is None:
        return
    try:
        await store.async_postpone(storage, msg["reminder_id"], due_at=msg["due_at"],
                                  expected_updated_at=msg["expected_updated_at"], until=msg["until"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_postponement", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True})


@callback
def async_setup_recurring_reminder_api(hass: HomeAssistant) -> None:
    if hass.data.get(DATA_API_REGISTERED):
        return
    for command in (
        websocket_list_reminders,
        websocket_create_reminder,
        websocket_update_reminder,
        websocket_delete_reminder,
        websocket_record_reminder,
        websocket_undo_reminder,
        websocket_postpone_reminder,
    ):
        websocket_api.async_register_command(hass, command)
    hass.data[DATA_API_REGISTERED] = True
