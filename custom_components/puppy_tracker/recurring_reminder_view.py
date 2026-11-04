"""Shared reconciled reminder read model for dashboard consumers."""

from __future__ import annotations

from typing import Any

from .const import DEFAULT_NOTIFICATION_LEAD_MINUTES
from .weight_dose import calculate_weight_dose
from .mother_storage import MotherScopeStorage
from .recurring_reminders import reminder_owner_records, reminder_status


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


async def async_reminder_items(store, storage, *, litter_id: str | None = None) -> list[dict[str, Any]]:
    """Share reconciled reminder state between management and execution views."""
    await store.async_reconcile_records(storage, litter_id=litter_id)
    async with storage.mutations.snapshot():
        return _reminder_items(store, storage, litter_id=litter_id)


def _reminder_items(store, storage, *, litter_id: str | None = None) -> list[dict[str, Any]]:
    """Build only after the caller has obtained a committed snapshot."""
    settings = storage.get_settings()
    default_lead_minutes = int(
        settings.get("notification_lead_minutes", DEFAULT_NOTIFICATION_LEAD_MINUTES)
    )
    items = []
    histories = {}
    for reminder in store.get_reminders(litter_id=litter_id):
        item = reminder_status(reminder, notification_lead_minutes=default_lead_minutes)
        item["owner_name"] = _owner_label(storage, reminder)
        item["dose"] = calculate_weight_dose(storage, reminder.get("weight_dose"), reminder["litter_id"], reminder["owner_scope"], reminder["owner_id"])
        owner = tuple(reminder[key] for key in ("litter_id", "owner_scope", "owner_id"))
        if owner not in histories:
            try:
                histories[owner] = {record["id"]: record for record in reminder_owner_records(storage, reminder)}
            except ValueError:
                histories[owner] = None
        item["owner_available"] = histories[owner] is not None
        item["last_execution"] = (histories[owner] or {}).get(reminder.get("last_completed_record_id"))
        items.append(item)
    items.sort(
        key=lambda item: (
            item.get("next_due_at") is None,
            str(item.get("next_due_at") or ""),
            str(item.get("title") or ""),
        )
    )
    return items
