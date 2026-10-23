"""Weighing session helpers for Puppy Tracker."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable
from copy import deepcopy
from datetime import timedelta
from uuid import uuid4

from homeassistant.util import dt as dt_util
from .time_utils import parse_timestamp

if TYPE_CHECKING:
    from .runtime import PuppyTrackerRuntimeData


SESSION_IDLE = "idle"
SESSION_ACTIVE = "active"
SESSION_COMPLETED = "completed"
SESSION_INTERRUPTED = "interrupted"
UNDO_SECONDS = 120


def new_session_state() -> dict[str, Any]:
    """Return a new empty weighing session."""

    return {
        "version": 1,
        "id": None,
        "revision": 0,
        "status": SESSION_IDLE,
        "litter_id": None,
        "puppy_ids": [],
        "weighed_puppy_ids": [],
        "started_at": None,
        "completed_at": None,
        "last_puppy_id": None,
        "last_litter_id": None,
        "last_measurement_id": None,
        "last_weight": None,
        "last_saved_at": None,
        "message": "Nog geen weegsessie gestart",
        "duplicate_pending": None,
        "measurement_ids": {},
    }


def get_session(
    runtime: PuppyTrackerRuntimeData,
) -> dict[str, Any]:
    """Return weighing session, creating it if necessary."""

    session = runtime.weighing_session

    if not isinstance(
        session,
        dict,
    ):
        session = new_session_state()

        runtime.weighing_session = session

    return session


def start_weighing_session(
    runtime: PuppyTrackerRuntimeData,
    litter_id: str,
    puppy_ids: list[str],
) -> None:
    """Start a new weighing session."""

    now = dt_util.now().isoformat()

    runtime.weighing_session = {
        **new_session_state(),
        "id": str(uuid4()),
        "status": SESSION_ACTIVE,
        "litter_id": litter_id,
        "puppy_ids": list(
            puppy_ids
        ),
        "weighed_puppy_ids": [],
        "started_at": now,
        "completed_at": None,
        "last_puppy_id": None,
        "last_litter_id": None,
        "last_measurement_id": None,
        "last_weight": None,
        "last_saved_at": None,
        "message": (
            "Weegsessie gestart"
        ),
        "duplicate_pending": None,
    }

    runtime.selected_litter_id = litter_id

    runtime.selected_puppy_id = (
        puppy_ids[0]
        if puppy_ids
        else None
    )

    runtime.weight_input = 0.0


def reset_weighing_session(
    runtime: PuppyTrackerRuntimeData,
) -> None:
    """Reset current weighing session."""

    runtime.weighing_session = new_session_state()
    runtime.weighing_undo = None

    runtime.selected_puppy_id = None

    runtime.weight_input = 0.0


def remaining_puppy_ids(
    session: dict[str, Any],
) -> list[str]:
    """Return puppy IDs not yet weighed during this session."""

    puppy_ids = session.get(
        "puppy_ids",
        [],
    )

    weighed = set(
        session.get(
            "weighed_puppy_ids",
            [],
        )
    )

    return [
        puppy_id
        for puppy_id in puppy_ids
        if puppy_id not in weighed
    ]


def _update_recorded_session(
    session: dict[str, Any],
    *,
    litter_id: str,
    puppy_id: str,
    puppy_name: str,
    weight: float,
    measurement_id: str | None = None,
) -> bool:
    """Update runtime session after a stored weight.

    Return True only when this weight just completed the active session.
    """

    now = dt_util.now().isoformat()
    session["last_litter_id"] = litter_id
    session["last_measurement_id"] = measurement_id
    session["revision"] = session.get("revision", 0) + 1

    session[
        "last_puppy_id"
    ] = puppy_id

    session[
        "last_weight"
    ] = float(weight)

    session[
        "last_saved_at"
    ] = now

    session[
        "duplicate_pending"
    ] = None

    session[
        "message"
    ] = (
        f"{puppy_name}: "
        f"{weight:g} g opgeslagen"
    )

    if (
        session.get("status")
        != SESSION_ACTIVE
    ):
        return False

    if (
        session.get("litter_id")
        != litter_id
    ):
        return False

    if (
        puppy_id
        not in session.get(
            "puppy_ids",
            [],
        )
    ):
        return False

    weighed = session.setdefault(
        "weighed_puppy_ids",
        [],
    )

    if puppy_id not in weighed:
        weighed.append(
            puppy_id
        )

    if measurement_id:
        session.setdefault("measurement_ids", {}).setdefault(puppy_id, []).append(measurement_id)

    remaining = remaining_puppy_ids(
        session
    )

    if remaining:
        return False

    session[
        "status"
    ] = SESSION_COMPLETED

    session[
        "completed_at"
    ] = now

    session[
        "message"
    ] = (
        f"Weegsessie voltooid: "
        f"{len(weighed)} van "
        f"{len(session.get('puppy_ids', []))} "
        f"pups gewogen"
    )
    return True


def mark_weight_recorded(runtime: PuppyTrackerRuntimeData, **weight: Any) -> bool:
    """Apply the transition and advance the live selection."""
    session = get_session(runtime)
    completed = _update_recorded_session(session, **weight)
    if session.get("status") == SESSION_ACTIVE and session.get("litter_id") == weight["litter_id"]:
        remaining = remaining_puppy_ids(session)
        if remaining:
            runtime.selected_puppy_id = remaining[0]
    return completed


def session_after_weight(session: dict[str, Any], **weight: Any) -> dict[str, Any]:
    """Apply the shared transition without changing the live runtime before commit."""
    staged = deepcopy(session)
    _update_recorded_session(staged, **weight)
    staged["duplicate_pending"] = None
    return staged


def _effective_session_measurement(puppy: dict[str, Any], measurement_id: Any) -> dict[str, Any] | None:
    """Follow a saved session ID through corrections, stopping at deletion/cycles."""
    measurements = {item.get("id"): item for item in puppy.get("measurements", []) if isinstance(item, dict)}
    seen = set()
    while isinstance(measurement_id, str) and measurement_id in measurements and measurement_id not in seen:
        seen.add(measurement_id)
        measurement = measurements[measurement_id]
        if measurement.get("deleted"):
            return None
        if not measurement.get("superseded_by"):
            return measurement
        measurement_id = measurement["superseded_by"]
    return None


def recover_session(storage: Any) -> dict[str, Any]:
    """Recover only a recognized checkpoint; never replay a weighing or an input."""
    raw = storage.get_weighing_session()
    if not isinstance(raw, dict) or raw.get("version") != 1:
        return new_session_state()
    if (not isinstance(raw.get("id"), str) or not raw["id"]
        or not isinstance(raw.get("revision"), int)
        or raw["revision"] < 0
        or raw.get("status") not in {SESSION_ACTIVE, SESSION_COMPLETED, SESSION_INTERRUPTED}
        or not isinstance(raw.get("litter_id"), str)
        or not isinstance(raw.get("puppy_ids"), list)
        or not all(isinstance(value, str) for value in raw["puppy_ids"])
        or not isinstance(raw.get("measurement_ids"), dict)):
        return new_session_state()
    session = {**new_session_state(), **deepcopy(raw), "duplicate_pending": None}
    litter = storage.get_litter(session["litter_id"])
    puppies = litter.get("puppies", {}) if litter and litter.get("active", True) else {}
    session["puppy_ids"] = list(dict.fromkeys(
        puppy_id for puppy_id in session["puppy_ids"]
        if puppy_id in puppies and puppies[puppy_id].get("active", True)
    ))
    weighed = []
    for puppy_id in session["puppy_ids"]:
        ids = session["measurement_ids"].get(puppy_id, [])
        for measurement_id in ids if isinstance(ids, list) else []:
            if _effective_session_measurement(puppies[puppy_id], measurement_id):
                weighed.append(puppy_id)
                break
    session["weighed_puppy_ids"] = weighed
    last_puppy = storage.get_puppy(session.get("last_litter_id"), session.get("last_puppy_id"))
    last = _effective_session_measurement(last_puppy, session.get("last_measurement_id")) if last_puppy else None
    session["last_measurement_id"] = last.get("id") if last else None
    session["last_weight"] = last.get("weight") if last else None
    if session["status"] != SESSION_COMPLETED:
        session["status"] = SESSION_INTERRUPTED
        session["completed_at"] = None
        session["message"] = "Onderbroken weegsessie: hervat of sluit af."
    return session


def reconcile_active_session(session: Any, litters: dict[str, Any]) -> dict[str, Any] | None:
    """Recheck live progress against effective history, not cached checkmarks."""
    if not isinstance(session, dict) or session.get("status") not in {SESSION_ACTIVE, SESSION_INTERRUPTED}:
        return session
    staged = deepcopy(session)
    litter = litters.get(staged.get("litter_id")) or {}
    puppies = litter.get("puppies", {}) if litter.get("active", True) else {}
    staged["puppy_ids"] = [pid for pid in staged.get("puppy_ids", [])
                           if pid in puppies and puppies[pid].get("active", True)]
    if not staged["puppy_ids"]:
        return None
    ids = staged.get("measurement_ids", {})
    staged["weighed_puppy_ids"] = [pid for pid in staged["puppy_ids"]
        if any(_effective_session_measurement(puppies[pid], mid) for mid in ids.get(pid, []))]
    last_puppy = (litters.get(staged.get("last_litter_id")) or {}).get("puppies", {}).get(staged.get("last_puppy_id"))
    last = _effective_session_measurement(last_puppy, staged.get("last_measurement_id")) if last_puppy else None
    if last is None and last_puppy:
        last = next((measurement for mid in reversed(ids.get(staged.get("last_puppy_id"), []))
                     if (measurement := _effective_session_measurement(last_puppy, mid))), None)
    staged["last_measurement_id"] = last.get("id") if last else None
    staged["last_weight"] = last.get("weight") if last else None
    if staged != session:
        staged["revision"] = session.get("revision", 0) + 1
        staged["duplicate_pending"] = None
        staged["message"] = ""
        if staged["status"] == SESSION_ACTIVE and not remaining_puppy_ids(staged):
            staged["status"] = SESSION_COMPLETED
            staged["completed_at"] = dt_util.now().isoformat()
    return staged


def sync_station_session(runtime: PuppyTrackerRuntimeData) -> bool:
    """Publish a persisted history transition without implicitly resuming recovery."""
    current = get_session(runtime)
    stored = runtime.storage.get_weighing_session()
    if stored is None and current.get("id") is None:
        return False
    candidate = stored if isinstance(stored, dict) else new_session_state()
    if (current.get("id"), current.get("revision")) == (candidate.get("id"), candidate.get("revision")):
        return False
    if current.get("status") == SESSION_INTERRUPTED and current.get("id") == candidate.get("id"):
        candidate["status"] = SESSION_INTERRUPTED
        candidate["completed_at"] = None
    runtime.weighing_session = candidate
    runtime.weighing_undo = None
    return True


async def async_record_station_weight(
    runtime: PuppyTrackerRuntimeData, *, expected_session: dict[str, Any] | None = None,
    validate_write: Callable[[], None] | None = None, station_command: bool = True, **weight: Any,
) -> str:
    """Serialize station writes and publish runtime progress only after persistence."""
    sync_station_session(runtime)
    expected = deepcopy(expected_session if expected_session is not None else get_session(runtime))
    async with runtime.weighing_lock:
        sync_station_session(runtime)
        session = get_session(runtime)
        active_member = (session.get("status") == SESSION_ACTIVE
            and session.get("litter_id") == weight["litter_id"] and weight["puppy_id"] in session.get("puppy_ids", []))
        if not station_command and not active_member:
            return await runtime.storage.async_record_weight(**weight)
        if station_command and (session.get("id"), session.get("revision")) != (expected.get("id"), expected.get("revision")):
            raise ValueError("De weegsessie is gewijzigd. Vernieuw de kaart en probeer opnieuw.")
        if session.get("status") == SESSION_INTERRUPTED:
            raise ValueError("Hervat de onderbroken weegsessie of sluit deze eerst af.")
        before_session = deepcopy(session)
        before_summary = runtime.storage.get_completed_weighing_summary(weight["litter_id"])
        measurement_id = await runtime.storage.async_record_weight(
            **weight, weighing_session=deepcopy(session), validate_write=validate_write,
        )
        checkpoint = runtime.storage.get_weighing_session()
        if isinstance(checkpoint, dict):
            runtime.weighing_session = deepcopy(checkpoint)
        else:
            puppy = runtime.storage.get_puppy(weight["litter_id"], weight["puppy_id"])
            mark_weight_recorded(runtime, litter_id=weight["litter_id"], puppy_id=weight["puppy_id"],
                                 puppy_name=puppy.get("name", "Puppy"), weight=weight["weight"],
                                 measurement_id=measurement_id)
        if runtime.weighing_session.get("status") == SESSION_ACTIVE:
            remaining = remaining_puppy_ids(runtime.weighing_session)
            runtime.selected_puppy_id = remaining[0] if remaining else runtime.selected_puppy_id
        runtime.weight_input = 0.0
        measurement = runtime.storage.get_measurement(weight["litter_id"], weight["puppy_id"], measurement_id)
        runtime.weighing_undo = {
            "id": str(uuid4()), "litter_id": weight["litter_id"], "puppy_id": weight["puppy_id"],
            "measurement": deepcopy(measurement), "before_session": before_session,
            "after_session": deepcopy(runtime.weighing_session), "before_summary": before_summary,
            "expires_at": (dt_util.utcnow() + timedelta(seconds=UNDO_SECONDS)).isoformat(),
        }
        return measurement_id


async def async_resolve_session(runtime: PuppyTrackerRuntimeData, *, resume: bool,
                                session_id: str, revision: int) -> None:
    """Resume/discard the exact interrupted checkpoint, never a newer session."""
    async with runtime.weighing_lock:
        current = get_session(runtime)
        if (current.get("id"), current.get("revision"), current.get("status")) != (session_id, revision, SESSION_INTERRUPTED):
            raise ValueError("De weegsessie is gewijzigd. Vernieuw de kaart en probeer opnieuw.")
        session = recover_session(runtime.storage) if resume else None
        if session is not None:
            if not remaining_puppy_ids(session):
                raise ValueError("Er zijn geen pups meer te wegen. Sluit de onderbroken sessie af.")
            session["status"] = SESSION_ACTIVE
            session["revision"] += 1
            session["message"] = "Weegsessie hervat"
        await runtime.storage.async_set_weighing_session(session, expected=current)
        runtime.weighing_session = session or new_session_state()
        runtime.weighing_undo = None
        runtime.weight_input = 0.0
        runtime.selected_puppy_id = (remaining_puppy_ids(session) or [None])[0] if session else None
        if session:
            runtime.selected_litter_id = session["litter_id"]


async def async_undo_station_weight(runtime: PuppyTrackerRuntimeData, *, undo_id: str,
                                    measurement_id: str) -> str:
    """Undo exactly one recent station save; no stack, replay or hard deletion."""
    async with runtime.weighing_lock:
        undo = runtime.weighing_undo
        expires = parse_timestamp(undo.get("expires_at")) if undo else None
        session = get_session(runtime)
        if (not undo or undo.get("id") != undo_id or not expires or dt_util.utcnow() >= expires
            or undo["measurement"]["id"] != measurement_id
            or session.get("last_measurement_id") != measurement_id
            or (session.get("id"), session.get("revision")) != (
                undo["after_session"].get("id"), undo["after_session"].get("revision"))):
            raise ValueError("Deze weging kan niet meer ongedaan worden gemaakt.")
        await runtime.storage.async_delete_weight(
            undo["litter_id"], undo["puppy_id"], measurement_id,
            reason="Weegstation: ongedaan gemaakt", weighing_undo=undo,
        )
        restored = deepcopy(undo["before_session"])
        restored["revision"] = session.get("revision", 0) + 1
        restored["duplicate_pending"] = None
        restored["message"] = "Laatste weging ongedaan gemaakt"
        runtime.weighing_session = restored
        runtime.weighing_undo = None
        if restored.get("status") != SESSION_ACTIVE or restored.get("litter_id") == undo["litter_id"]:
            runtime.selected_litter_id = undo["litter_id"]
            runtime.selected_puppy_id = undo["puppy_id"]
        runtime.weight_input = 0.0
        return undo["puppy_id"]
