"""WebSocket API and reconciliation for generic recurring reminders."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .api import _runtime_data, _runtime_storage
from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE
from .mother_storage import MotherScopeStorage
from .recurring_reminders import RecurringReminderStore, reminder_matches_record, reminder_status
from .time_utils import timestamp_sort_key

DATA_API_REGISTERED = f"{DOMAIN}_recurring_reminder_api_registered"


def _store_or_error(hass: HomeAssistant, connection, msg) -> RecurringReminderStore | None:
    runtime = _runtime_data(hass)
    store = getattr(runtime, "recurring_reminders", None) if runtime is not None else None
    if not isinstance(store, RecurringReminderStore):
        connection.send_error(msg["id"], "not_loaded", "Recurring reminders are not loaded")
        return None
    return store


def _validate_owner(storage, data: dict[str, Any]) -> None:
    litter_id = str(data.get("litter_id") or "")
    scope = str(data.get("owner_scope") or "")
    owner_id = str(data.get("owner_id") or "")
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")
    if scope == "litter":
        return
    if scope == "puppy":
        if storage.get_puppy(litter_id, owner_id) is None:
            raise ValueError("Unknown puppy for this litter")
        return
    if scope == "mother":
        if not isinstance(storage, MotherScopeStorage):
            raise ValueError("Mother scope is not available")
        mother = storage.get_mother_for_litter(litter_id)
        if mother is None or str(mother.get("id")) != owner_id:
            raise ValueError("Unknown mother for this litter")
        return
    raise ValueError("Unsupported reminder owner scope")


def _owner_records(storage, reminder: dict[str, Any]) -> list[dict[str, Any]]:
    litter_id = str(reminder.get("litter_id") or "")
    scope = str(reminder.get("owner_scope") or "")
    owner_id = str(reminder.get("owner_id") or "")
    if scope == "litter":
        return storage.get_records(litter_id, newest_first=False)
    if scope == "puppy":
        return storage.get_records(litter_id, owner_id, newest_first=False)
    if scope == "mother" and isinstance(storage, MotherScopeStorage):
        return [
            item for item in storage.get_records(litter_id, mother_id=owner_id, newest_first=False)
            if str(item.get("litter_id") or "") == litter_id
        ]
    return []


async def async_reconcile_recurring_reminders(hass: HomeAssistant, *, litter_id: str | None = None) -> None:
    """Advance reminders from matching dossier records without owner cross-talk."""
    runtime = _runtime_data(hass)
    storage = _runtime_storage(hass)
    store = getattr(runtime, "recurring_reminders", None) if runtime is not None else None
    if storage is None or not isinstance(store, RecurringReminderStore):
        return

    for reminder in store.get_reminders(litter_id=litter_id):
        matches = [item for item in _owner_records(storage, reminder) if reminder_matches_record(reminder, item)]
        if not matches:
            continue
        matches.sort(key=lambda item: timestamp_sort_key(item.get("occurred_at") or item.get("created_at")))
        newest = matches[-1]
        await store.async_match_record(
            litter_id=str(reminder["litter_id"]),
            owner_scope=str(reminder["owner_scope"]),
            owner_id=str(reminder["owner_id"]),
            record=newest,
        )


def _owner_label(storage, reminder: dict[str, Any]) -> str:
    scope = reminder.get("owner_scope")
    litter_id = str(reminder.get("litter_id") or "")
    owner_id = str(reminder.get("owner_id") or "")
    litter = storage.get_litter(litter_id) or {}
    if scope == "litter":
        return str(litter.get("name") or "Hele nest")
    if scope == "puppy":
        puppy = storage.get_puppy(litter_id, owner_id) or {}
        return str(puppy.get("name") or "Pup")
    if scope == "mother" and isinstance(storage, MotherScopeStorage):
        mother = storage.get_mother(owner_id) or {}
        return str(mother.get("name") or "Moederhond")
    return owner_id


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/recurring_reminders",
    vol.Optional("litter_id"): str,
})
@websocket_api.async_response
async def websocket_list_reminders(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    storage = _runtime_storage(hass)
    if store is None or storage is None:
        return
    await async_reconcile_recurring_reminders(hass, litter_id=msg.get("litter_id"))
    items = []
    for reminder in store.get_reminders(litter_id=msg.get("litter_id")):
        item = reminder_status(reminder)
        item["owner_name"] = _owner_label(storage, reminder)
        items.append(item)
    items.sort(key=lambda item: (item.get("next_due_at") is None, str(item.get("next_due_at") or ""), str(item.get("title") or "")))
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
})
@websocket_api.async_response
async def websocket_create_reminder(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    storage = _runtime_storage(hass)
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
})
@websocket_api.async_response
async def websocket_update_reminder(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    storage = _runtime_storage(hass)
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


@callback
def async_setup_recurring_reminder_api(hass: HomeAssistant) -> None:
    if hass.data.get(DATA_API_REGISTERED):
        return
    for command in (
        websocket_list_reminders,
        websocket_create_reminder,
        websocket_update_reminder,
        websocket_delete_reminder,
    ):
        websocket_api.async_register_command(hass, command)
    hass.data[DATA_API_REGISTERED] = True
