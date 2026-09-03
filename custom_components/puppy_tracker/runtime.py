"""Typed runtime state for Puppy Tracker."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

from .session import SESSION_ACTIVE, new_session_state
from .storage import PuppyTrackerStorage

if TYPE_CHECKING:
    from .attention_acknowledgements import AttentionAcknowledgementStore
    from .care_programs import AgeBasedCareProgramStore
    from .care_reminders import CareReminderStore
    from .notifications import PuppyNotificationManager
    from .recurring_notifications import RecurringReminderNotificationManager
    from .recurring_reminders import RecurringReminderStore


@dataclass(slots=True)
class PuppyTrackerRuntimeData:
    """Runtime-only state owned by one config entry."""

    storage: PuppyTrackerStorage
    care_reminders: CareReminderStore | None = None
    recurring_reminders: RecurringReminderStore | None = None
    care_programs: AgeBasedCareProgramStore | None = None
    attention_acknowledgements: AttentionAcknowledgementStore | None = None
    selected_litter_id: str | None = None
    selected_puppy_id: str | None = None
    weight_input: float = 0.0
    weighing_session: dict[str, Any] = field(default_factory=new_session_state)
    notification_manager: PuppyNotificationManager | None = None
    recurring_notification_manager: RecurringReminderNotificationManager | None = None
    last_backup_at: str | None = None
    last_backup_status: str = "unknown"
    last_backup_path: str | None = None
    last_backup_scope: str | None = None
    last_backup_count: int | None = None


def reconcile_dashboard_selection(
    runtime: PuppyTrackerRuntimeData,
) -> bool:
    """Keep dashboard litter and puppy selections valid.

    This is an explicit state transition helper. Entity properties must remain
    side-effect free and only report the already selected value.

    Return True when either selection changed.
    """

    changed = False
    litters = runtime.storage.get_litters()

    active_litter_ids = [
        litter_id
        for litter_id, litter in litters.items()
        if litter.get("active", True)
    ]

    session = runtime.weighing_session
    session_litter_id = (
        session.get("litter_id")
        if session.get("status") == SESSION_ACTIVE
        else None
    )

    if (
        session_litter_id in active_litter_ids
        and runtime.selected_litter_id != session_litter_id
    ):
        runtime.selected_litter_id = session_litter_id
        runtime.selected_puppy_id = None
        changed = True

    elif runtime.selected_litter_id not in active_litter_ids:
        new_litter_id = (
            active_litter_ids[0]
            if active_litter_ids
            else None
        )

        if runtime.selected_litter_id != new_litter_id:
            runtime.selected_litter_id = new_litter_id
            changed = True

        if runtime.selected_puppy_id is not None:
            runtime.selected_puppy_id = None
            changed = True

    litter_id = runtime.selected_litter_id

    if litter_id is None:
        if runtime.selected_puppy_id is not None:
            runtime.selected_puppy_id = None
            changed = True

        return changed

    litter = litters.get(litter_id)
    if litter is None:
        if runtime.selected_puppy_id is not None:
            runtime.selected_puppy_id = None
            changed = True

        return changed

    puppies = litter.get("puppies", {})

    if (
        session.get("status") == SESSION_ACTIVE
        and session.get("litter_id") == litter_id
    ):
        available_puppy_ids = [
            puppy_id
            for puppy_id in session.get("puppy_ids", [])
            if puppy_id in puppies
            and puppies[puppy_id].get("active", True)
        ]
    else:
        available_puppy_ids = [
            puppy_id
            for puppy_id, puppy in puppies.items()
            if puppy.get("active", True)
        ]

    if runtime.selected_puppy_id not in available_puppy_ids:
        new_puppy_id = (
            available_puppy_ids[0]
            if available_puppy_ids
            else None
        )

        if runtime.selected_puppy_id != new_puppy_id:
            runtime.selected_puppy_id = new_puppy_id
            changed = True

    return changed
