"""WebSocket API for age-based litter care programs."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .api import _runtime_data, _runtime_storage
from .care_occurrences import derive_litter_care_occurrences
from .care_programs import AgeBasedCareProgramStore
from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE

DATA_API_REGISTERED = f"{DOMAIN}_care_program_api_registered"


def _store_or_error(hass: HomeAssistant, connection, msg) -> AgeBasedCareProgramStore | None:
    runtime = _runtime_data(hass)
    store = getattr(runtime, "care_programs", None) if runtime is not None else None
    if not isinstance(store, AgeBasedCareProgramStore):
        connection.send_error(msg["id"], "not_loaded", "Care programs are not loaded")
        return None
    return store


def _validate_litter(storage, litter_id: str) -> dict[str, Any]:
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")
    return litter


PROGRAM_FIELDS = {
    "litter_id",
    "enabled",
    "title",
    "description",
    "record_type",
    "schedule_type",
    "start_age_days",
    "end_age_days",
    "interval_days",
    "time_of_day",
    "notifications_enabled",
    "result_fields",
}


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/care_programs",
    vol.Optional("litter_id"): str,
})
@websocket_api.async_response
async def websocket_list_care_programs(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    if store is None:
        return
    connection.send_result(
        msg["id"],
        {"programs": store.get_programs(litter_id=msg.get("litter_id"))},
    )


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/care_occurrences",
    vol.Required("litter_id"): str,
    vol.Optional("program_id"): str,
})
@websocket_api.async_response
async def websocket_list_care_occurrences(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    storage = _runtime_storage(hass)
    if store is None or storage is None:
        return
    try:
        litter = _validate_litter(storage, msg["litter_id"])
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return

    programs = store.get_programs(litter_id=msg["litter_id"])
    if msg.get("program_id"):
        programs = [item for item in programs if item.get("id") == msg["program_id"]]
        if not programs:
            connection.send_error(msg["id"], "not_found", "Unknown care program")
            return

    puppies = [
        puppy
        for puppy in (litter.get("puppies") or {}).values()
        if isinstance(puppy, dict)
    ]
    occurrences: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    for program in programs:
        for puppy in puppies:
            if puppy.get("active", True) is False:
                continue
            try:
                occurrences.extend(derive_litter_care_occurrences(program, [puppy]))
            except ValueError as err:
                skipped.append({
                    "program_id": str(program.get("id") or ""),
                    "puppy_id": str(puppy.get("id") or ""),
                    "reason": str(err),
                })
    occurrences.sort(key=lambda item: (item["scheduled_at"], item["puppy_id"], item["program_id"]))
    connection.send_result(msg["id"], {"occurrences": occurrences, "skipped": skipped})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/care_program/create",
    vol.Required("litter_id"): str,
    vol.Optional("enabled", default=True): bool,
    vol.Required("title"): str,
    vol.Optional("description"): vol.Any(str, None),
    vol.Optional("record_type", default="note"): str,
    vol.Required("schedule_type"): vol.In(("once", "range")),
    vol.Required("start_age_days"): vol.Coerce(int),
    vol.Optional("end_age_days"): vol.Coerce(int),
    vol.Optional("interval_days", default=1): vol.Coerce(int),
    vol.Optional("time_of_day"): vol.Any(str, None),
    vol.Optional("notifications_enabled", default=True): bool,
    vol.Optional("result_fields"): [vol.In(("result", "score", "note"))],
})
@websocket_api.async_response
async def websocket_create_care_program(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    storage = _runtime_storage(hass)
    if store is None or storage is None:
        return
    data = {key: value for key, value in msg.items() if key in PROGRAM_FIELDS}
    try:
        _validate_litter(storage, data["litter_id"])
        program_id = await store.async_create(data)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_care_program", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True, "program_id": program_id})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/care_program/update",
    vol.Required("program_id"): str,
    vol.Optional("litter_id"): str,
    vol.Optional("enabled"): bool,
    vol.Optional("title"): str,
    vol.Optional("description"): vol.Any(str, None),
    vol.Optional("record_type"): str,
    vol.Optional("schedule_type"): vol.In(("once", "range")),
    vol.Optional("start_age_days"): vol.Coerce(int),
    vol.Optional("end_age_days"): vol.Coerce(int),
    vol.Optional("interval_days"): vol.Coerce(int),
    vol.Optional("time_of_day"): vol.Any(str, None),
    vol.Optional("notifications_enabled"): bool,
    vol.Optional("result_fields"): [vol.In(("result", "score", "note"))],
})
@websocket_api.async_response
async def websocket_update_care_program(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    storage = _runtime_storage(hass)
    if store is None or storage is None:
        return
    current = store.get_program(msg["program_id"])
    if current is None:
        connection.send_error(msg["id"], "not_found", "Unknown care program")
        return
    updates = {key: value for key, value in msg.items() if key in PROGRAM_FIELDS}
    candidate = {**current, **updates}
    try:
        _validate_litter(storage, str(candidate.get("litter_id") or ""))
        await store.async_update(msg["program_id"], candidate)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_care_program", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/care_program/delete",
    vol.Required("program_id"): str,
})
@websocket_api.async_response
async def websocket_delete_care_program(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    if store is None:
        return
    try:
        await store.async_delete(msg["program_id"])
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True})


@callback
def async_setup_care_program_api(hass: HomeAssistant) -> None:
    if hass.data.get(DATA_API_REGISTERED):
        return
    for command in (
        websocket_list_care_programs,
        websocket_list_care_occurrences,
        websocket_create_care_program,
        websocket_update_care_program,
        websocket_delete_care_program,
    ):
        websocket_api.async_register_command(hass, command)
    hass.data[DATA_API_REGISTERED] = True
