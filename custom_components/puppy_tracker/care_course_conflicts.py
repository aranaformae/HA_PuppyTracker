"""Advisory overlap detection for finite puppy treatment schedules."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from homeassistant.util import dt as dt_util

from .care_occurrences import derive_puppy_care_occurrences


def _instant(value: Any) -> datetime | None:
    parsed = dt_util.parse_datetime(str(value or ""))
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_util.get_default_time_zone())
    return parsed.astimezone(timezone.utc)


def course_schedule_conflicts(
    storage,
    candidate: dict[str, Any],
    programs: list[dict[str, Any]],
    reminders: list[dict[str, Any]],
    *,
    exclude_program_id: str | None = None,
) -> list[dict[str, str]]:
    """Find likely duplicate schedules; never mutate or disable another source."""
    if candidate.get("schedule_type") != "course":
        return []
    litter_id = candidate["litter_id"]
    record_type = candidate["record_type"]
    conflicts: list[dict[str, str]] = []
    seen: set[tuple[str, str, str]] = set()

    def add(kind: str, puppy: dict[str, Any], title: str) -> None:
        key = (kind, str(puppy["id"]), title)
        if key not in seen and len(conflicts) < 30:
            conflicts.append({"kind": kind, "puppy_name": str(puppy.get("name") or puppy["id"]), "title": title})
            seen.add(key)

    for puppy_id in candidate.get("target_puppy_ids") or []:
        puppy = storage.get_puppy(litter_id, puppy_id)
        if puppy is None:
            continue
        proposed = derive_puppy_care_occurrences(candidate, puppy)
        proposed_instants = {_instant(item["scheduled_at"]) for item in proposed}
        dates = {item["scheduled_date"] for item in proposed}
        times = {item["time_of_day"] for item in proposed}

        for program in programs:
            if (program.get("id") == exclude_program_id or program.get("enabled", True) is False
                    or program.get("record_type") != record_type):
                continue
            try:
                other = derive_puppy_care_occurrences(program, puppy)
            except ValueError:
                continue
            if any(_instant(item["scheduled_at"]) in proposed_instants for item in other):
                add("care_program", puppy, str(program.get("title") or "Zorgprogramma"))

        for reminder in reminders:
            if (reminder.get("enabled", True) is False or reminder.get("litter_id") != litter_id
                    or reminder.get("record_type") != record_type or reminder.get("owner_scope") != "puppy"
                    or reminder.get("owner_id") != puppy_id):
                continue
            mode = reminder.get("schedule_mode")
            due = _instant(reminder.get("due_at"))
            start = _instant(reminder.get("start_at"))
            conflict = (mode == "once" and due in proposed_instants)
            if mode == "fixed_times" and (set(reminder.get("fixed_times") or []) & times):
                conflict = start is None or any(moment >= start for moment in proposed_instants if moment)
            if mode == "interval" and start is not None:
                # Interval reminders can drift after completion. Flag a possible
                # overlap for review instead of claiming an exact collision.
                conflict = any(moment >= start for moment in proposed_instants if moment)
            if conflict:
                add("reminder", puppy, str(reminder.get("title") or "Herinnering"))

        records = storage.get_records(litter_id, puppy_id, newest_first=False)
        completed_followups = {
            str((record.get("data") or {}).get("followup_record_id") or "")
            for record in records if isinstance(record.get("data"), dict)
        }
        for record in records:
            if record.get("type") != record_type or record.get("id") in completed_followups:
                continue
            data = record.get("data") if isinstance(record.get("data"), dict) else {}
            due_date = str(data.get("next_due_date") or "")[:10]
            if due_date in dates:
                add("dossier_followup", puppy, str(record.get("title") or "Volgende datum"))
    return conflicts
