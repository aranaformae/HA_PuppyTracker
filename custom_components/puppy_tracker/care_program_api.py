"""WebSocket API for age-based litter care programs."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_send

from .api import _runtime_data, _runtime_storage
from .care_occurrences import derive_litter_care_occurrences
from .care_programs import (
    AgeBasedCareProgramStore,
    care_program_identity_changed,
    normalize_care_program,
)
from .care_results import async_record_care_result
from .care_status import care_occurrence_status
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


def _derive_occurrence(
    storage,
    program: dict[str, Any],
    *,
    puppy_id: str,
    occurrence_id: str,
) -> dict[str, Any]:
    """Re-derive one requested occurrence instead of trusting client payload data."""
    litter_id = str(program.get("litter_id") or "")
    puppy = storage.get_puppy(litter_id, puppy_id)
    if puppy is None or puppy.get("active", True) is False:
        raise ValueError("Unknown active puppy for this care program")
    occurrences = derive_litter_care_occurrences(program, [puppy])
    for occurrence in occurrences:
        if str(occurrence.get("id") or "") == occurrence_id:
            return occurrence
    raise ValueError("Unknown occurrence for this care program and puppy")


def _existing_occurrence_result(storage, occurrence: dict[str, Any]) -> dict[str, Any] | None:
    records = storage.get_records(
        str(occurrence.get("litter_id") or ""),
        str(occurrence.get("puppy_id") or ""),
        newest_first=True,
    )
    occurrence_id = str(occurrence.get("id") or "")
    for record in records:
        if record.get("deleted", False):
            continue
        data = record.get("data") if isinstance(record.get("data"), dict) else {}
        if str(data.get("care_occurrence_id") or "") == occurrence_id:
            return record
    return None


def _program_has_active_results(storage, program: dict[str, Any]) -> bool:
    """Return whether a care program already owns any active dossier result."""
    program_id = str(program.get("id") or "")
    litter_id = str(program.get("litter_id") or "")
    litter = storage.get_litter(litter_id) or {}
    for puppy_id, puppy in (litter.get("puppies") or {}).items():
        if not isinstance(puppy, dict):
            continue
        for record in storage.get_records(litter_id, str(puppy_id), newest_first=False):
            if record.get("deleted", False):
                continue
            data = record.get("data") if isinstance(record.get("data"), dict) else {}
            if str(data.get("care_program_id") or "") == program_id:
                return True
    return False


def _skip_reason_code(reason: str) -> str:
    """Return a stable UI-safe reason code for one derivation failure."""
    if reason == "puppy birth_time is required":
        return "missing_birth_time"
    return "invalid_schedule"


PROGRAM_FIELDS = {
    "litter_id", "enabled", "title", "description", "record_type",
    "schedule_type", "start_age_days", "end_age_days", "interval_days",
    "time_of_day", "notifications_enabled", "notification_lead_minutes", "result_fields",
}


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/care_programs", vol.Optional("litter_id"): str})
@websocket_api.async_response
async def websocket_list_care_programs(hass, connection, msg) -> None:
    store = _store_or_error(hass, connection, msg)
    if store is None:
        return
    connection.send_result(msg["id"], {"programs": store.get_programs(litter_id=msg.get("litter_id"))})


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

    puppies = [puppy for puppy in (litter.get("puppies") or {}).values() if isinstance(puppy, dict)]
    occurrences: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []
    for program in programs:
        for puppy in puppies:
            if puppy.get("active", True) is False:
                continue
            try:
                derived = derive_litter_care_occurrences(program, [puppy])
                records = storage.get_records(msg["litter_id"], str(puppy.get("id") or ""), newest_first=False)
                occurrences.extend(care_occurrence_status(item, records) for item in derived)
            except ValueError as err:
                reason = str(err)
                skipped.append({
                    "program_id": str(program.get("id") or ""),
                    "puppy_id": str(puppy.get("id") or ""),
                    "puppy_name": str(puppy.get("name") or puppy.get("id") or "Pup"),
                    "reason_code": _skip_reason_code(reason),
                    "reason": reason,
                })
    occurrences.sort(key=lambda item: (item["scheduled_at"], item["puppy_id"], item["program_id"]))
    connection.send_result(msg["id"], {"occurrences": occurrences, "skipped": skipped})


@websocket_api.websocket_command({
    vol.Required("type"): f"{DOMAIN}/care_occurrence/record",
    vol.Required("program_id"): str,
    vol.Required("puppy_id"): str,
    vol.Required("occurrence_id"): str,
    vol.Required("status"): vol.In(("completed", "missed")),
    vol.Optional("result"): vol.Any(str, None),
    vol.Optional("score"): vol.Any(float, int, str, None),
    vol.Optional("note"): vol.Any(str, None),
    vol.Optional("data"): dict,
    vol.Optional("occurred_at"): vol.Any(str, None),
})
@websocket_api.async_response
async def websocket_record_care_occurrence(hass, connection, msg) -> None:
    """Record one exact care occurrence as a canonical puppy dossier record."""
    store = _store_or_error(hass, connection, msg)
    storage = _runtime_storage(hass)
    if store is None or storage is None:
        return
    program = store.get_program(msg["program_id"])
    if program is None:
        connection.send_error(msg["id"], "not_found", "Unknown care program")
        return
    try:
        occurrence = _derive_occurrence(
            storage,
            program,
            puppy_id=msg["puppy_id"],
            occurrence_id=msg["occurrence_id"],
        )
        if _existing_occurrence_result(storage, occurrence) is not None:
            raise ValueError("This care occurrence already has an active result")
        result = {
            "status": msg["status"],
            "result": msg.get("result"),
            "score": msg.get("score"),
            "note": msg.get("note"),
            "data": msg.get("data") or {},
        }
        record_id = await async_record_care_result(
            storage,
            program,
            occurrence,
            result,
            occurred_at=msg.get("occurred_at"),
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_care_result", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True, "record_id": record_id})


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
    vol.Optional("notification_lead_minutes"): vol.Any(vol.Coerce(int), None),
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
    vol.Optional("notification_lead_minutes"): vol.Any(vol.Coerce(int), None),
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
        normalized_candidate = normalize_care_program(
            candidate,
            program_id=str(current.get("id") or msg["program_id"]),
            updated_at=str(current.get("updated_at") or "") or None,
        )
        if (
            care_program_identity_changed(current, normalized_candidate)
            and _program_has_active_results(storage, current)
        ):
            connection.send_error(
                msg["id"],
                "care_program_locked",
                "Care program schedule and result identity cannot be changed after results exist; create a new care program instead",
            )
            return
        await store.async_update(msg["program_id"], candidate)
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_care_program", str(err))
        return
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.require_admin
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/care_program/delete", vol.Required("program_id"): str})
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
        websocket_record_care_occurrence,
        websocket_create_care_program,
        websocket_update_care_program,
        websocket_delete_care_program,
    ):
        websocket_api.async_register_command(hass, command)
    hass.data[DATA_API_REGISTERED] = True
