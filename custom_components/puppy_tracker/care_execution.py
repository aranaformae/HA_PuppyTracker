"""Read model for executing care without creating another task store."""

from __future__ import annotations

from typing import Any

from .mother_storage import MotherScopeStorage
from .recurring_reminder_view import async_reminder_items
from .upcoming import upcoming_actions


async def async_execution_sources(runtime, litter: dict[str, Any], *, days_ahead: int) -> dict[str, Any]:
    """Project current reminders and follow-ups for active owners in one litter."""
    storage = runtime.storage
    litter_id = litter["id"]
    puppies = [puppy for puppy in (litter.get("puppies") or {}).values()
               if isinstance(puppy, dict) and puppy.get("active", True) is not False]
    context = {
        "litter": {key: litter.get(key) for key in ("id", "name", "mother", "mother_id", "active")},
        "puppies": [{key: puppy.get(key) for key in ("id", "name", "collar_color")} for puppy in puppies],
    }
    if litter.get("active", True) is False:
        return {**context, "reminders": [], "followups": []}

    records = storage.get_records(litter_id, newest_first=False)
    for puppy in puppies:
        for record in storage.get_records(litter_id, puppy["id"], newest_first=False):
            record["puppy_name"] = puppy.get("name")
            records.append(record)
    if isinstance(storage, MotherScopeStorage) and litter.get("mother_id"):
        records.extend(record for record in storage.get_records(
            litter_id, mother_id=litter["mother_id"], newest_first=False,
        ) if record.get("litter_id") == litter_id)

    reminders = []
    if runtime.recurring_reminders is not None:
        active_ids = {puppy["id"] for puppy in puppies}
        reminders = [item for item in await async_reminder_items(
            runtime.recurring_reminders, storage, litter_id=litter_id,
        ) if item.get("enabled", True) and item.get("owner_available") and item.get("next_due_at")
            and (item.get("owner_scope") != "puppy" or item.get("owner_id") in active_ids)]
    return {**context, "reminders": reminders,
            "followups": upcoming_actions(records, days_ahead=days_ahead, litter_id=litter_id)}
