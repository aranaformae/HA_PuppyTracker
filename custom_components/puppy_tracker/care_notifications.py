"""Grouped notification checks for age-based litter care occurrences."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from homeassistant.components.persistent_notification import (
    async_create as async_create_persistent_notification,
    async_dismiss as async_dismiss_persistent_notification,
)
from homeassistant.core import HomeAssistant

from .care_occurrences import derive_litter_care_occurrences
from .care_programs import AgeBasedCareProgramStore
from .care_status import care_occurrence_status
from .const import DEFAULT_NOTIFICATIONS_ENABLED, DEFAULT_NOTIFY_ENTITIES, DOMAIN
from .notification_delivery import async_send_notify_entities, normalize_notify_entities
from .runtime import PuppyTrackerRuntimeData

DUE_STATUSES = {"due_today", "overdue"}
DATA_NOTIFICATION_STATE = f"{DOMAIN}_care_notification_state"


def _state(hass: HomeAssistant) -> dict[str, set[str]]:
    return hass.data.setdefault(
        DATA_NOTIFICATION_STATE,
        {"notified_occurrences": set(), "active_groups": set()},
    )


async def async_check_care_notifications(hass: HomeAssistant, runtime: PuppyTrackerRuntimeData) -> None:
    """Refresh persistent care notices and push each open occurrence once."""
    store = runtime.care_programs
    if not isinstance(store, AgeBasedCareProgramStore):
        return

    settings = runtime.storage.get_settings()
    globally_enabled = bool(settings.get("notifications_enabled", DEFAULT_NOTIFICATIONS_ENABLED))
    notify_entities = normalize_notify_entities(settings.get("notify_entities", DEFAULT_NOTIFY_ENTITIES))
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for program in store.get_programs():
        if (
            not globally_enabled
            or program.get("enabled", True) is False
            or program.get("notifications_enabled", True) is False
        ):
            continue
        litter_id = str(program.get("litter_id") or "")
        litter = runtime.storage.get_litter(litter_id) or {}
        puppies = [
            puppy
            for puppy in (litter.get("puppies") or {}).values()
            if isinstance(puppy, dict) and puppy.get("active", True) is not False
        ]
        for puppy in puppies:
            try:
                derived = derive_litter_care_occurrences(program, [puppy])
            except ValueError:
                continue
            records = runtime.storage.get_records(
                litter_id,
                str(puppy.get("id") or ""),
                newest_first=False,
            )
            for occurrence in derived:
                item = care_occurrence_status(occurrence, records)
                if item.get("status") not in DUE_STATUSES:
                    continue
                scheduled_date = str(item.get("scheduled_at") or "")[:10]
                key = f"{item.get('program_id')}:{item.get('age_days')}:{scheduled_date}"
                groups[key].append(item)

    state = _state(hass)
    active_groups = set(groups)
    for stale in state["active_groups"] - active_groups:
        async_dismiss_persistent_notification(hass, _notification_id(stale))
    state["active_groups"] = active_groups

    for key, items in groups.items():
        items.sort(key=lambda item: str(item.get("puppy_name") or ""))
        title = f"Puppy Tracker · {items[0].get('title') or 'Zorgprogramma'}"
        message = _message(items)
        async_create_persistent_notification(
            hass,
            message,
            title=title,
            notification_id=_notification_id(key),
        )

        fresh_ids = [
            str(item.get("id") or "")
            for item in items
            if str(item.get("id") or "") not in state["notified_occurrences"]
        ]
        if fresh_ids:
            await async_send_notify_entities(hass, notify_entities, title, message)
            state["notified_occurrences"].update(fresh_ids)

    open_ids = {
        str(item.get("id") or "")
        for items in groups.values()
        for item in items
    }
    state["notified_occurrences"].intersection_update(open_ids)


def async_clear_care_notifications(hass: HomeAssistant) -> None:
    """Dismiss known persistent care notices and clear runtime dedup state."""
    state = hass.data.pop(DATA_NOTIFICATION_STATE, None)
    if not state:
        return
    for key in state.get("active_groups", set()):
        async_dismiss_persistent_notification(hass, _notification_id(key))


def _message(items: list[dict[str, Any]]) -> str:
    first = items[0]
    status = str(first.get("status") or "")
    age_days = int(first.get("age_days") or 0)
    puppy_names = [str(item.get("puppy_name") or "Pup") for item in items]
    timing = "is vandaag aan de beurt" if status == "due_today" else "is achterstallig"
    if len(items) == 1:
        return (
            f"**{first.get('title', 'Zorgactie')} · dag {age_days}** voor "
            f"**{puppy_names[0]}** {timing}. Open Today of Aandacht om het resultaat vast te leggen."
        )
    return (
        f"**{first.get('title', 'Zorgactie')} · dag {age_days}** {timing} voor "
        f"**{len(items)} pups**: {', '.join(puppy_names)}. "
        "Open Today of Aandacht om resultaten vast te leggen."
    )


def _notification_id(group_key: str) -> str:
    safe = "".join(ch if ch.isalnum() else "_" for ch in group_key)
    return f"{DOMAIN}_care_{safe}"
