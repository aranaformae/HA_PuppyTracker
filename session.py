"""Weighing session helpers for Puppy Weight Tracker."""

from __future__ import annotations

from typing import Any

from homeassistant.util import dt as dt_util


SESSION_IDLE = "idle"
SESSION_ACTIVE = "active"
SESSION_COMPLETED = "completed"


def new_session_state() -> dict[str, Any]:
    """Return a new empty weighing session."""

    return {
        "status": SESSION_IDLE,
        "litter_id": None,
        "puppy_ids": [],
        "weighed_puppy_ids": [],
        "started_at": None,
        "completed_at": None,
        "last_puppy_id": None,
        "last_weight": None,
        "last_saved_at": None,
        "message": "Nog geen weegsessie gestart",
        "duplicate_pending": None,
    }


def get_session(
    runtime: dict[str, Any],
) -> dict[str, Any]:
    """Return weighing session, creating it if necessary."""

    session = runtime.get(
        "weighing_session"
    )

    if not isinstance(
        session,
        dict,
    ):
        session = new_session_state()

        runtime[
            "weighing_session"
        ] = session

    return session


def start_weighing_session(
    runtime: dict[str, Any],
    litter_id: str,
    puppy_ids: list[str],
) -> None:
    """Start a new weighing session."""

    now = dt_util.now().isoformat()

    runtime[
        "weighing_session"
    ] = {
        "status": SESSION_ACTIVE,
        "litter_id": litter_id,
        "puppy_ids": list(
            puppy_ids
        ),
        "weighed_puppy_ids": [],
        "started_at": now,
        "completed_at": None,
        "last_puppy_id": None,
        "last_weight": None,
        "last_saved_at": None,
        "message": (
            "Weegsessie gestart"
        ),
        "duplicate_pending": None,
    }

    runtime[
        "selected_litter_id"
    ] = litter_id

    runtime[
        "selected_puppy_id"
    ] = (
        puppy_ids[0]
        if puppy_ids
        else None
    )

    runtime[
        "weight_input"
    ] = 0.0


def reset_weighing_session(
    runtime: dict[str, Any],
) -> None:
    """Reset current weighing session."""

    runtime[
        "weighing_session"
    ] = new_session_state()

    runtime[
        "selected_puppy_id"
    ] = None

    runtime[
        "weight_input"
    ] = 0.0


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


def mark_weight_recorded(
    runtime: dict[str, Any],
    *,
    litter_id: str,
    puppy_id: str,
    puppy_name: str,
    weight: float,
) -> None:
    """Update runtime session after a stored weight."""

    session = get_session(
        runtime
    )

    now = dt_util.now().isoformat()

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
        return

    if (
        session.get("litter_id")
        != litter_id
    ):
        return

    if (
        puppy_id
        not in session.get(
            "puppy_ids",
            [],
        )
    ):
        return

    weighed = session.setdefault(
        "weighed_puppy_ids",
        [],
    )

    if puppy_id not in weighed:
        weighed.append(
            puppy_id
        )

    remaining = remaining_puppy_ids(
        session
    )

    if remaining:
        runtime[
            "selected_puppy_id"
        ] = remaining[0]

        return

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