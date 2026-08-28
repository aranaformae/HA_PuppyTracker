"""WebSocket data, measurement management, and export API for Puppy Weight Tracker."""

from __future__ import annotations

import csv
import io
import json
import re
from copy import deepcopy
from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect, async_dispatcher_send
from homeassistant.util import dt as dt_util

from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE, SIGNAL_UPDATE
from .storage import PuppyWeightStorage
from .time_utils import timestamp_sort_key

DATA_API_REGISTERED = f"{DOMAIN}_websocket_api_registered"
API_VERSION = 3


def _runtime_storage(hass: HomeAssistant) -> PuppyWeightStorage | None:
    """Return the storage instance for the configured integration entry."""
    domain_data = hass.data.get(DOMAIN)
    if not isinstance(domain_data, dict):
        return None

    for runtime in domain_data.values():
        if not isinstance(runtime, dict):
            continue
        storage = runtime.get("storage")
        if isinstance(storage, PuppyWeightStorage):
            return storage

    return None


def _active_measurements(puppy: dict[str, Any]) -> list[dict[str, Any]]:
    """Return effective measurements sorted chronologically."""
    measurements = [
        deepcopy(measurement)
        for measurement in puppy.get("measurements", [])
        if not measurement.get("deleted", False)
        and measurement.get("superseded_by") is None
    ]
    measurements.sort(
        key=lambda item: (
            timestamp_sort_key(item.get("timestamp")),
            item.get("created_at") or "",
        )
    )
    return measurements


def _all_measurements(puppy: dict[str, Any]) -> list[dict[str, Any]]:
    """Return all measurement versions, newest first, including deleted data."""
    measurements = [deepcopy(item) for item in puppy.get("measurements", [])]
    measurements.sort(
        key=lambda item: (
            timestamp_sort_key(item.get("timestamp")),
            item.get("created_at") or "",
        ),
        reverse=True,
    )
    return measurements


def _measurement_status(measurement: dict[str, Any]) -> str:
    """Return a compact status for a stored measurement version."""
    if measurement.get("deleted", False):
        return "deleted"
    if measurement.get("superseded_by") is not None:
        return "superseded"
    return "active"


def _litter_payload(
    storage: PuppyWeightStorage,
    litter_id: str,
    *,
    can_manage_measurements: bool = False,
) -> dict[str, Any]:
    """Build graph data from Puppy Weight Tracker's own persistent storage."""
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")

    puppies: list[dict[str, Any]] = []
    for puppy_id, puppy in litter.get("puppies", {}).items():
        puppies.append(
            {
                "id": puppy_id,
                "name": puppy.get("name"),
                "collar_color": puppy.get("collar_color"),
                "sex": puppy.get("sex"),
                "birth_weight": puppy.get("birth_weight"),
                "birth_time": puppy.get("birth_time"),
                "active": puppy.get("active", True),
                "created_at": puppy.get("created_at"),
                "updated_at": puppy.get("updated_at"),
                "measurements": _active_measurements(puppy),
            }
        )

    puppies.sort(key=lambda item: (str(item.get("name") or "").lower(), item["id"]))

    return {
        "api_version": API_VERSION,
        "generated_at": dt_util.now().isoformat(),
        "storage_updated_at": storage.get_data().get("updated_at"),
        "can_manage_measurements": can_manage_measurements,
        "integrity": storage.get_integrity_report(),
        "litter": {
            "id": litter_id,
            "name": litter.get("name"),
            "birth_date": litter.get("birth_date"),
            "mother": litter.get("mother"),
            "father": litter.get("father"),
            "active": litter.get("active", True),
            "created_at": litter.get("created_at"),
            "updated_at": litter.get("updated_at"),
            "last_completed_session": deepcopy(litter.get("last_completed_session")),
        },
        "puppies": puppies,
    }


def _puppy_measurements_payload(
    storage: PuppyWeightStorage,
    litter_id: str,
    puppy_id: str,
) -> dict[str, Any]:
    """Build complete measurement history for one puppy."""
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")

    puppy = storage.get_puppy(litter_id, puppy_id)
    if puppy is None:
        raise ValueError("Unknown puppy")

    measurements = _all_measurements(puppy)
    for measurement in measurements:
        measurement["status"] = _measurement_status(measurement)
        measurement["is_birth_measurement"] = (
            measurement.get("id") == puppy.get("birth_measurement_id")
            or measurement.get("kind") == "birth"
        )

    active_count = sum(item["status"] == "active" for item in measurements)
    deleted_count = sum(item["status"] == "deleted" for item in measurements)
    superseded_count = sum(item["status"] == "superseded" for item in measurements)

    return {
        "api_version": API_VERSION,
        "generated_at": dt_util.now().isoformat(),
        "storage_updated_at": storage.get_data().get("updated_at"),
        "litter": {
            "id": litter_id,
            "name": litter.get("name"),
        },
        "puppy": {
            "id": puppy_id,
            "name": puppy.get("name"),
            "collar_color": puppy.get("collar_color"),
            "sex": puppy.get("sex"),
            "birth_weight": puppy.get("birth_weight"),
            "birth_time": puppy.get("birth_time"),
            "birth_measurement_id": puppy.get("birth_measurement_id"),
        },
        "counts": {
            "total_versions": len(measurements),
            "active": active_count,
            "deleted": deleted_count,
            "superseded": superseded_count,
        },
        "measurements": measurements,
    }


def _safe_filename(value: str | None) -> str:
    """Return a filesystem-friendly filename component."""
    text = (value or "nest").strip().lower()
    text = re.sub(r"[^a-z0-9_-]+", "-", text)
    return text.strip("-") or "nest"


def _csv_export(storage: PuppyWeightStorage, litter_id: str) -> tuple[str, str, str]:
    """Export effective measurements as spreadsheet-friendly CSV."""
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")

    output = io.StringIO(newline="")
    writer = csv.writer(output, delimiter=";", lineterminator="\n")
    writer.writerow(
        [
            "litter_id",
            "litter_name",
            "litter_birth_date",
            "mother",
            "father",
            "puppy_id",
            "puppy_name",
            "collar_color",
            "sex",
            "puppy_birth_time",
            "birth_weight_g",
            "measurement_id",
            "measurement_timestamp",
            "weight_g",
            "kind",
            "note",
            "correction_reason",
        ]
    )

    rows: list[tuple[str, dict[str, Any], dict[str, Any]]] = []
    for puppy_id, puppy in litter.get("puppies", {}).items():
        for measurement in _active_measurements(puppy):
            rows.append((puppy_id, puppy, measurement))

    rows.sort(
        key=lambda item: (
            timestamp_sort_key(item[2].get("timestamp")),
            str(item[1].get("name") or "").lower(),
        )
    )

    for puppy_id, puppy, measurement in rows:
        writer.writerow(
            [
                litter_id,
                litter.get("name") or "",
                litter.get("birth_date") or "",
                litter.get("mother") or "",
                litter.get("father") or "",
                puppy_id,
                puppy.get("name") or "",
                puppy.get("collar_color") or "",
                puppy.get("sex") or "",
                puppy.get("birth_time") or "",
                puppy.get("birth_weight") if puppy.get("birth_weight") is not None else "",
                measurement.get("id") or "",
                measurement.get("timestamp") or "",
                measurement.get("weight") if measurement.get("weight") is not None else "",
                measurement.get("kind") or "",
                measurement.get("note") or "",
                measurement.get("correction_reason") or "",
            ]
        )

    stamp = dt_util.now().strftime("%Y%m%d-%H%M%S")
    filename = f"puppy-weight-tracker-{_safe_filename(litter.get('name'))}-{stamp}.csv"
    return filename, "text/csv;charset=utf-8", output.getvalue()


def _json_export(storage: PuppyWeightStorage, litter_id: str) -> tuple[str, str, str]:
    """Export a complete litter including correction/deletion history and audit data."""
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")

    all_data = storage.get_data()
    audit_log = [
        deepcopy(item)
        for item in all_data.get("audit_log", [])
        if item.get("litter_id") == litter_id
    ]

    document = {
        "export_version": 1,
        "exported_at": dt_util.now().isoformat(),
        "integration": DOMAIN,
        "schema_version": all_data.get("schema_version"),
        "litter": litter,
        "audit_log": audit_log,
    }

    stamp = dt_util.now().strftime("%Y%m%d-%H%M%S")
    filename = f"puppy-weight-tracker-{_safe_filename(litter.get('name'))}-{stamp}.json"
    content = json.dumps(document, ensure_ascii=False, indent=2, sort_keys=False)
    return filename, "application/json;charset=utf-8", content


def _storage_or_error(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> PuppyWeightStorage | None:
    """Return storage or send a consistent websocket error."""
    storage = _runtime_storage(hass)
    if storage is None:
        connection.send_error(msg["id"], "not_loaded", "Puppy Weight Tracker is not loaded")
    return storage


def _signal_measurement_change(hass: HomeAssistant, puppy_id: str) -> None:
    """Refresh entities, cards, and monitoring after a measurement mutation."""
    async_dispatcher_send(hass, SIGNAL_UPDATE, puppy_id)
    async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/data",
        vol.Required("litter_id"): str,
    }
)
@callback
def websocket_get_data(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return persistent measurement data for a litter."""
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return

    try:
        result = _litter_payload(
            storage,
            msg["litter_id"],
            can_manage_measurements=bool(connection.user and connection.user.is_admin),
        )
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return

    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/measurements",
        vol.Required("litter_id"): str,
        vol.Required("puppy_id"): str,
    }
)
@callback
def websocket_get_measurements(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return complete editable measurement history for one puppy."""
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return

    try:
        result = _puppy_measurements_payload(storage, msg["litter_id"], msg["puppy_id"])
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return

    connection.send_result(msg["id"], result)


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/measurement/correct",
        vol.Required("litter_id"): str,
        vol.Required("puppy_id"): str,
        vol.Required("measurement_id"): str,
        vol.Required("weight"): vol.All(vol.Coerce(float), vol.Range(min=1, max=10000)),
        vol.Required("timestamp"): str,
        vol.Optional("reason"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def websocket_correct_measurement(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Correct one active measurement while preserving its history."""
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return

    try:
        replacement_id = await storage.async_correct_measurement(
            msg["litter_id"],
            msg["puppy_id"],
            msg["measurement_id"],
            new_weight=float(msg["weight"]),
            new_timestamp=msg["timestamp"],
            reason=(msg.get("reason") or None),
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_measurement", str(err))
        return

    storage.refresh_integrity_report()
    _signal_measurement_change(hass, msg["puppy_id"])
    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "measurement_id": replacement_id,
            "action": "correct",
            "measurement_data": _puppy_measurements_payload(
                storage,
                msg["litter_id"],
                msg["puppy_id"],
            ),
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/measurement/delete",
        vol.Required("litter_id"): str,
        vol.Required("puppy_id"): str,
        vol.Required("measurement_id"): str,
        vol.Optional("reason"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def websocket_delete_measurement(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Soft-delete one current measurement."""
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return

    try:
        await storage.async_delete_weight(
            msg["litter_id"],
            msg["puppy_id"],
            msg["measurement_id"],
            reason=(msg.get("reason") or None),
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_measurement", str(err))
        return

    storage.refresh_integrity_report()
    _signal_measurement_change(hass, msg["puppy_id"])
    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "action": "delete",
            "measurement_data": _puppy_measurements_payload(
                storage,
                msg["litter_id"],
                msg["puppy_id"],
            ),
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/measurement/restore",
        vol.Required("litter_id"): str,
        vol.Required("puppy_id"): str,
        vol.Required("measurement_id"): str,
        vol.Optional("reason"): vol.Any(str, None),
    }
)
@websocket_api.async_response
async def websocket_restore_measurement(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Restore one soft-deleted measurement."""
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return

    try:
        restored_id = await storage.async_restore_weight(
            msg["litter_id"],
            msg["puppy_id"],
            msg["measurement_id"],
            reason=(msg.get("reason") or None),
        )
    except ValueError as err:
        connection.send_error(msg["id"], "invalid_measurement", str(err))
        return

    storage.refresh_integrity_report()
    _signal_measurement_change(hass, msg["puppy_id"])
    connection.send_result(
        msg["id"],
        {
            "ok": True,
            "action": "restore",
            "measurement_id": restored_id,
            "restored_as_new_version": restored_id != msg["measurement_id"],
            "measurement_data": _puppy_measurements_payload(
                storage,
                msg["litter_id"],
                msg["puppy_id"],
            ),
        },
    )


@websocket_api.require_admin
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/integrity",
        vol.Optional("repair", default=False): bool,
    }
)
@websocket_api.async_response
async def websocket_integrity_check(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Run or retrieve the storage integrity check."""
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return

    report = await storage.async_run_integrity_check(
        repair=bool(msg.get("repair", False)),
    )
    if msg.get("repair"):
        async_dispatcher_send(hass, SIGNAL_DASHBOARD_UPDATE)
    connection.send_result(msg["id"], report)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/export",
        vol.Required("litter_id"): str,
        vol.Required("format"): vol.In(("csv", "json")),
    }
)
@callback
def websocket_export_data(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return a downloadable CSV or JSON export."""
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return

    try:
        if msg["format"] == "csv":
            filename, mime_type, content = _csv_export(storage, msg["litter_id"])
        else:
            filename, mime_type, content = _json_export(storage, msg["litter_id"])
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return

    connection.send_result(
        msg["id"],
        {
            "filename": filename,
            "mime_type": mime_type,
            "content": content,
        },
    )


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def websocket_subscribe_updates(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Subscribe a frontend card to integration data changes."""

    @callback
    def forward_update(*_args: Any) -> None:
        storage = _runtime_storage(hass)
        connection.send_event(
            msg["id"],
            {
                "updated_at": (
                    storage.get_data().get("updated_at") if storage is not None else None
                )
            },
        )

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass,
        SIGNAL_DASHBOARD_UPDATE,
        forward_update,
    )
    connection.send_result(msg["id"])


@callback
def async_setup_api(hass: HomeAssistant) -> None:
    """Register Puppy Weight Tracker websocket commands once."""
    if hass.data.get(DATA_API_REGISTERED):
        return

    websocket_api.async_register_command(hass, websocket_get_data)
    websocket_api.async_register_command(hass, websocket_get_measurements)
    websocket_api.async_register_command(hass, websocket_correct_measurement)
    websocket_api.async_register_command(hass, websocket_delete_measurement)
    websocket_api.async_register_command(hass, websocket_restore_measurement)
    websocket_api.async_register_command(hass, websocket_integrity_check)
    websocket_api.async_register_command(hass, websocket_export_data)
    websocket_api.async_register_command(hass, websocket_subscribe_updates)
    hass.data[DATA_API_REGISTERED] = True
