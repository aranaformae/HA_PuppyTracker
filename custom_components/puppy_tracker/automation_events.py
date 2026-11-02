"""Privacy-limited transitions derived from committed care and monitoring facts."""

from __future__ import annotations

from collections import Counter
from datetime import datetime, time, timedelta
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.util import dt as dt_util

from .care_occurrences import derive_litter_care_occurrences
from .care_status import care_occurrence_status, index_care_result_records
from .const import (
    EVENT_CARE_DUE_CHANGED, EVENT_PUPPY_ATTENTION_CHANGED,
    SIGNAL_DASHBOARD_UPDATE, SIGNAL_UPDATE,
)
from .metrics import calculate_puppy_status
from .notification_runner import NotificationCheckRunner
from .recurring_reminders import completion_state_from_records, next_due_at, reminder_owner_is_active
from .runtime import PuppyTrackerRuntimeData
from .time_utils import resolve_wall_time
from .upcoming import upcoming_actions

CHECK_INTERVAL = timedelta(minutes=1)


def _utc(value: datetime) -> str:
    return dt_util.as_utc(value).isoformat()


def project_automation_state(runtime: PuppyTrackerRuntimeData, now: datetime) -> tuple[dict, dict]:
    """Project identifiers/codes only; no event delivery or storage mutation."""
    storage = runtime.storage
    due: dict[tuple, dict[str, Any]] = {}
    attention: dict[tuple[str, str], dict[str, Any]] = {}
    records: dict[tuple[str, str, str], list[dict]] = {}
    care_counts: Counter = Counter()
    followup_counts: Counter = Counter()
    litters = storage.get_litters()

    def owner_records(litter_id: str, scope: str, owner_id: str) -> list[dict]:
        key = (litter_id, scope, owner_id)
        if key not in records:
            if scope == "mother":
                rows = storage.get_records(litter_id, mother_id=owner_id, newest_first=False)
                records[key] = [row for row in rows if row.get("litter_id") == litter_id]
            else:
                records[key] = storage.get_records(litter_id, owner_id if scope == "puppy" else None, newest_first=False)
        return records[key]

    def add(source: str, litter_id: str, scope: str, owner_id: str, scheduled: datetime, **identity) -> None:
        item = {"source": source, "litter_id": litter_id, "owner_scope": scope,
                "owner_id": owner_id, "puppy_id": owner_id if scope == "puppy" else None,
                "due_at": _utc(scheduled), **identity}
        key = (source, litter_id, scope, owner_id, tuple(identity.items()), item["due_at"])
        due[key] = item

    programs = runtime.care_programs.get_programs() if runtime.care_programs else []
    for litter_id, litter in litters.items():
        if litter.get("active", True) is False:
            continue
        puppies = [puppy for puppy in litter.get("puppies", {}).values() if puppy.get("active", True)]
        indexes = {puppy["id"]: index_care_result_records(owner_records(litter_id, "puppy", puppy["id"]))
                   for puppy in puppies}
        for program in programs:
            if program.get("litter_id") != litter_id or not program.get("enabled", True):
                continue
            for occurrence in derive_litter_care_occurrences(program, puppies):
                puppy_id = occurrence["puppy_id"]
                # Only matching facts enter the status projection; history is indexed once per owner.
                item = care_occurrence_status(occurrence, indexes[puppy_id].get(occurrence["id"], []), now=now)
                if item["status"] not in {"due_today", "overdue"}:
                    continue
                scheduled = dt_util.parse_datetime(item["scheduled_at"])
                # Age-only programs become due on their HA calendar day, as in Care.
                if not item.get("time_of_day"):
                    scheduled = resolve_wall_time(datetime.combine(dt_util.as_local(scheduled).date(), time(),
                                                                    tzinfo=dt_util.get_default_time_zone()))
                add("care_program", litter_id, "puppy", puppy_id, scheduled,
                    program_id=item["program_id"], occurrence_id=item["id"])
                if item.get("counts_for_attention", True):
                    care_counts[(litter_id, puppy_id)] += 1

        owners = [("litter", litter_id), *[("puppy", puppy["id"]) for puppy in puppies]]
        if litter.get("mother_id") and hasattr(storage, "get_mother"):
            owners.append(("mother", litter["mother_id"]))
        for scope, owner_id in owners:
            for item in upcoming_actions(owner_records(litter_id, scope, owner_id), today=dt_util.as_local(now).date(), days_ahead=0):
                day = datetime.fromisoformat(item["due_date"]).date()
                scheduled = resolve_wall_time(datetime.combine(day, time(), tzinfo=dt_util.get_default_time_zone()))
                add("dossier_followup", litter_id, scope, owner_id, scheduled, record_id=item["record_id"])
                if scope == "puppy":
                    followup_counts[(litter_id, owner_id)] += 1

        for puppy in puppies:
            puppy_id = puppy["id"]
            key = (litter_id, puppy_id)
            status = calculate_puppy_status(storage, litter_id, puppy_id)
            reasons = set()
            if status.get("needs_attention"):
                reasons.add(status["status_code"])
            if care_counts[key]:
                reasons.add("care_due")
            if followup_counts[key]:
                reasons.add("dossier_followup_due")
            if reasons:
                attention[key] = {"litter_id": litter_id, "puppy_id": puppy_id,
                                  "reason_codes": sorted(reasons), "care_due_count": care_counts[key],
                                  "dossier_due_count": followup_counts[key]}

    if runtime.recurring_reminders:
        for reminder in runtime.recurring_reminders.get_reminders():
            if not reminder_owner_is_active(storage, reminder):
                continue
            litter_id, scope, owner_id = (reminder[key] for key in ("litter_id", "owner_scope", "owner_id"))
            # Reconcile purely from dossier facts; event observation must not save scheduler state.
            current = completion_state_from_records(reminder, owner_records(litter_id, scope, owner_id), now)
            scheduled = next_due_at(current, now=now)
            if scheduled is not None and dt_util.as_utc(scheduled) <= dt_util.as_utc(now):
                add("recurring_reminder", litter_id, scope, owner_id, scheduled, reminder_id=reminder["id"])
    return due, attention


class DerivedAutomationEventManager:
    """Observe state boundaries once; delivery preferences do not alter state."""

    def __init__(self, hass: HomeAssistant, runtime: PuppyTrackerRuntimeData) -> None:
        self.hass = hass
        self.runtime = runtime
        self._runner = NotificationCheckRunner(hass, lambda: self.async_check())
        self._due: dict | None = None
        self._attention: dict = {}
        self._restore_generation: int | None = None
        self._last_checked: datetime | None = None

    async def async_start(self) -> None:
        # Baseline before exposing callbacks; existing work is not a new transition.
        await self.async_check()
        self._runner.start((SIGNAL_DASHBOARD_UPDATE, SIGNAL_UPDATE), CHECK_INTERVAL)

    async def async_stop(self) -> None:
        await self._runner.async_stop()
        self._due = None
        self._attention.clear()
        self._last_checked = None

    async def async_check(self) -> None:
        if self._runner.stopping:
            return
        async with self.runtime.storage.mutations.snapshot():
            if self._runner.stopping:
                return
            now = dt_util.now()
            generation = self.runtime.storage.mutations.restore_generation
            due, attention = project_automation_state(self.runtime, now)
            baseline = (self._due is None or generation != self._restore_generation
                        or (self._last_checked is not None
                            and dt_util.as_utc(now) < dt_util.as_utc(self._last_checked)))
            previous_due, previous_attention = self._due or {}, self._attention
            # Commit the observed state before callbacks can schedule another check.
            self._due, self._attention = due, attention
            self._restore_generation, self._last_checked = generation, now
            if baseline:
                return
            timestamp = _utc(now)
            for key, item in previous_due.items():
                if key not in due:
                    self.hass.bus.async_fire(EVENT_CARE_DUE_CHANGED, {**item, "transition": "cleared", "timestamp": timestamp})
            for key, item in due.items():
                if key not in previous_due:
                    self.hass.bus.async_fire(EVENT_CARE_DUE_CHANGED, {**item, "transition": "due", "timestamp": timestamp})
            for key in sorted(previous_attention.keys() | attention.keys()):
                before, after = previous_attention.get(key), attention.get(key)
                if before == after:
                    continue
                self.hass.bus.async_fire(EVENT_PUPPY_ATTENTION_CHANGED, {
                    **(after or {**before, "reason_codes": [], "care_due_count": 0, "dossier_due_count": 0}),
                    "reason_codes": list(after["reason_codes"]) if after else [],
                    "previous_reason_codes": list(before["reason_codes"]) if before else [],
                    "transition": "cleared" if after is None else "started" if before is None else "changed",
                    "timestamp": timestamp,
                })
