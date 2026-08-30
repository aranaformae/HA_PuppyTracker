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
from .measurements import measurement_status, puppy_measurements
from .metrics import calculate_puppy_metrics
from .pdf_export import build_pdf_export
from .runtime import PuppyWeightTrackerRuntimeData
from .session import get_session, remaining_puppy_ids
from .storage import PuppyWeightStorage
from .time_utils import timestamp_sort_key

DATA_API_REGISTERED = f"{DOMAIN}_websocket_api_registered"
API_VERSION = 5


def _runtime_data(hass: HomeAssistant) -> PuppyWeightTrackerRuntimeData | None:
    """Return runtime data for the loaded integration entry."""
    for entry in hass.config_entries.async_entries(DOMAIN):
        runtime = entry.runtime_data
        if isinstance(runtime, PuppyWeightTrackerRuntimeData):
            return runtime
    return None


def _runtime_storage(hass: HomeAssistant) -> PuppyWeightStorage | None:
    """Return the storage instance for the configured integration entry."""
    runtime = _runtime_data(hass)
    return runtime.storage if runtime is not None else None


def _puppy_summary(
    storage: PuppyWeightStorage,
    litter_id: str,
    puppy_id: str,
    puppy: dict[str, Any],
) -> dict[str, Any]:
    """Build canonical current metrics for one puppy."""
    del puppy  # Metrics are read canonically from storage.

    try:
        return calculate_puppy_metrics(storage, litter_id, puppy_id)
    except Exception:  # Keep frontend data available if one metric is malformed.
        return {
            "current_weight": None,
            "previous_weight": None,
            "change_grams": None,
            "growth_birth_percent": None,
            "growth_24h_percent": None,
            "growth_24h_grams": None,
            "last_weighed": None,
            "latest_measurement_id": None,
            "measurement_count": 0,
            "status": "Onbekend",
            "status_code": "unknown",
            "needs_attention": False,
            "weight_loss": False,
            "hours_since_weighing": None,
            "first_day_weight_change_percent": None,
            "growth_check_active": False,
        }


def _litter_summary(
    storage: PuppyWeightStorage,
    litter_id: str,
    litter: dict[str, Any],
    puppy_summaries: dict[str, dict[str, Any]],
    session: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build compact litter metrics for dashboard cards."""
    active: list[tuple[str, dict[str, Any]]] = [
        (puppy_id, puppy)
        for puppy_id, puppy in litter.get("puppies", {}).items()
        if puppy.get("active", True)
    ]

    summaries = [puppy_summaries[puppy_id] for puppy_id, _puppy in active]
    weighted = [
        (puppy_id, puppy, puppy_summaries[puppy_id].get("current_weight"))
        for puppy_id, puppy in active
        if puppy_summaries[puppy_id].get("current_weight") is not None
    ]
    attention = [item for item in summaries if item.get("needs_attention")]
    weigh_due = [
        item
        for item in summaries
        if item.get("status_code") in {"weigh_due", "no_measurement"}
    ]
    growth_values = [
        float(item["growth_24h_percent"])
        for item in summaries
        if item.get("growth_24h_percent") is not None
    ]

    average_weight = None
    if weighted:
        average_weight = round(
            sum(float(item[2]) for item in weighted) / len(weighted),
            1,
        )

    lightest = None
    heaviest = None
    if weighted:
        low = min(weighted, key=lambda item: float(item[2]))
        high = max(weighted, key=lambda item: float(item[2]))
        lightest = {
            "id": low[0],
            "name": low[1].get("name"),
            "weight": low[2],
        }
        heaviest = {
            "id": high[0],
            "name": high[1].get("name"),
            "weight": high[2],
        }

    session_payload = None
    if session and session.get("litter_id") == litter_id:
        puppy_ids = list(session.get("puppy_ids") or [])
        weighed = list(session.get("weighed_puppy_ids") or [])
        session_payload = {
            "status": session.get("status"),
            "started_at": session.get("started_at"),
            "completed_at": session.get("completed_at"),
            "weighed": len(weighed),
            "total": len(puppy_ids),
            "remaining": max(0, len(puppy_ids) - len(weighed)),
            "next_puppy_id": (remaining_puppy_ids(session) or [None])[0],
            "last_puppy_id": session.get("last_puppy_id"),
            "last_weight": session.get("last_weight"),
        }

    return {
        "active_puppies": len(active),
        "weighted_puppies": len(weighted),
        "attention_count": len(attention),
        "weigh_due_count": len(weigh_due),
        "average_weight": average_weight,
        "average_growth_24h_percent": (
            round(sum(growth_values) / len(growth_values), 2)
            if growth_values
            else None
        ),
        "lightest": lightest,
        "heaviest": heaviest,
        "last_completed_session": deepcopy(litter.get("last_completed_session")),
        "session": session_payload,
    }


def _litter_payload(
    storage: PuppyWeightStorage,
    litter_id: str,
    *,
    can_manage_measurements: bool = False,
    session: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build graph data from Puppy Weight Tracker's own persistent storage."""
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")

    puppies: list[dict[str, Any]] = []
    puppy_summaries: dict[str, dict[str, Any]] = {}
    for puppy_id, puppy in litter.get("puppies", {}).items():
        summary = _puppy_summary(storage, litter_id, puppy_id, puppy)
        puppy_summaries[puppy_id] = summary
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
                "summary": summary,
                "measurements": puppy_measurements(puppy, active_only=True, copy_items=True),
            }
        )

    puppies.sort(key=lambda item: (str(item.get("name") or "").lower(), item["id"]))
    litter_summary = _litter_summary(
        storage,
        litter_id,
        litter,
        puppy_summaries,
        session=session,
    )

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
            "summary": litter_summary,
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

    measurements = puppy_measurements(puppy, newest_first=True, copy_items=True)
    for measurement in measurements:
        measurement["status"] = measurement_status(measurement)
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


def _csv_export(
    storage: PuppyWeightStorage,
    litter_id: str,
    *,
    puppy_id: str | None = None,
    range_hours: float | None = None,
) -> tuple[str, str, str]:
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
    cutoff = None
    if range_hours is not None and range_hours > 0:
        cutoff = dt_util.now().timestamp() - float(range_hours) * 3600

    for current_puppy_id, puppy in litter.get("puppies", {}).items():
        if puppy_id is not None and current_puppy_id != puppy_id:
            continue
        for measurement in puppy_measurements(puppy, active_only=True, copy_items=True):
            if cutoff is not None and timestamp_sort_key(measurement.get("timestamp")) < cutoff:
                continue
            rows.append((current_puppy_id, puppy, measurement))

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
    {vol.Required("type"): f"{DOMAIN}/litters"}
)
@callback
def websocket_get_litters(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return all litters with compact summaries for dashboard discovery."""
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return

    runtime = _runtime_data(hass)
    session = get_session(runtime) if runtime is not None else None
    items: list[dict[str, Any]] = []
    for litter_id, litter in storage.get_litters().items():
        puppy_summaries = {
            puppy_id: _puppy_summary(storage, litter_id, puppy_id, puppy)
            for puppy_id, puppy in litter.get("puppies", {}).items()
        }
        items.append(
            {
                "id": litter_id,
                "name": litter.get("name"),
                "birth_date": litter.get("birth_date"),
                "mother": litter.get("mother"),
                "father": litter.get("father"),
                "active": litter.get("active", True),
                "summary": _litter_summary(
                    storage,
                    litter_id,
                    litter,
                    puppy_summaries,
                    session=session,
                ),
            }
        )

    items.sort(
        key=lambda item: (
            not bool(item.get("active", True)),
            str(item.get("birth_date") or ""),
            str(item.get("name") or "").lower(),
        ),
        reverse=False,
    )
    connection.send_result(
        msg["id"],
        {
            "api_version": API_VERSION,
            "generated_at": dt_util.now().isoformat(),
            "can_manage_measurements": bool(
                connection.user and connection.user.is_admin
            ),
            "litters": items,
        },
    )


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
        runtime = _runtime_data(hass)
        session = get_session(runtime) if runtime is not None else None
        result = _litter_payload(
            storage,
            msg["litter_id"],
            can_manage_measurements=bool(connection.user and connection.user.is_admin),
            session=session,
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
        vol.Optional("timestamp"): str,
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
            new_timestamp=msg.get("timestamp"),
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
        vol.Required("format"): vol.In(("csv", "json", "pdf")),
        vol.Optional("puppy_id"): str,
        vol.Optional("range_hours"): vol.All(vol.Coerce(float), vol.Range(min=0, max=24 * 3650)),
    }
)
@callback
def websocket_export_data(
    hass: HomeAssistant,
    connection: websocket_api.ActiveConnection,
    msg: dict[str, Any],
) -> None:
    """Return a downloadable CSV, JSON, or PDF export."""
    storage = _storage_or_error(hass, connection, msg)
    if storage is None:
        return

    try:
        if msg["format"] == "csv":
            filename, mime_type, content = _csv_export(
                storage,
                msg["litter_id"],
                puppy_id=msg.get("puppy_id"),
                range_hours=msg.get("range_hours"),
            )
            encoding = "text"
        elif msg["format"] == "pdf":
            filename, mime_type, content = build_pdf_export(
                storage,
                msg["litter_id"],
                puppy_id=msg.get("puppy_id"),
                range_hours=msg.get("range_hours"),
            )
            encoding = "base64"
        else:
            filename, mime_type, content = _json_export(storage, msg["litter_id"])
            encoding = "text"
    except ValueError as err:
        connection.send_error(msg["id"], "not_found", str(err))
        return

    connection.send_result(
        msg["id"],
        {
            "filename": filename,
            "mime_type": mime_type,
            "content": content,
            "encoding": encoding,
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

    websocket_api.async_register_command(hass, websocket_get_litters)
    websocket_api.async_register_command(hass, websocket_get_data)
    websocket_api.async_register_command(hass, websocket_get_measurements)
    websocket_api.async_register_command(hass, websocket_correct_measurement)
    websocket_api.async_register_command(hass, websocket_delete_measurement)
    websocket_api.async_register_command(hass, websocket_restore_measurement)
    websocket_api.async_register_command(hass, websocket_integrity_check)
    websocket_api.async_register_command(hass, websocket_export_data)
    websocket_api.async_register_command(hass, websocket_subscribe_updates)
    hass.data[DATA_API_REGISTERED] = True
