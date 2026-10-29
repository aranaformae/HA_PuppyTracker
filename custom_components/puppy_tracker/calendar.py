"""Read-only calendar of open Puppy Tracker care for each litter."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddConfigEntryEntitiesCallback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.util import dt as dt_util

from .care_occurrences import derive_litter_care_occurrences
from .care_status import care_occurrence_status, index_care_result_records
from .const import DOMAIN, SIGNAL_DASHBOARD_UPDATE, SIGNAL_NEW_LITTER
from .dog_identity import puppy_selector_label
from .recurring_reminders import (
    completion_state_from_records,
    next_due_at,
    reminder_owner_records,
)
from .runtime import PuppyTrackerRuntimeData
from .upcoming import upcoming_actions

REFRESH_INTERVAL = timedelta(minutes=30)
CARE_EVENT_DURATION = timedelta(minutes=30)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddConfigEntryEntitiesCallback,
) -> None:
    """Create one calendar for each existing and newly added litter."""
    runtime = entry.runtime_data
    if not isinstance(runtime, PuppyTrackerRuntimeData):
        raise RuntimeError("Puppy Tracker runtime is unavailable")
    known = set(runtime.storage.get_litters())
    async_add_entities([LitterCareCalendar(entry, litter_id) for litter_id in known])

    @callback
    def add_litter(litter_id: str) -> None:
        if litter_id not in known:
            known.add(litter_id)
            async_add_entities([LitterCareCalendar(entry, litter_id)])

    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL_NEW_LITTER, add_litter))


def _overlaps(event: CalendarEvent, start: datetime, end: datetime) -> bool:
    """Match Home Assistant's exclusive end boundary for calendar queries."""
    return event.start_datetime_local < end and event.end_datetime_local > start


def _recurring_reminder_events(
    runtime: PuppyTrackerRuntimeData,
    litter_id: str,
    litter: dict[str, Any],
    puppies: dict[str, dict[str, Any]],
    start: datetime,
    end: datetime,
) -> list[CalendarEvent]:
    """Show the one currently open moment of each valid reminder."""
    store = runtime.recurring_reminders
    if store is None:
        return []
    storage = runtime.storage
    now = dt_util.now()
    histories: dict[tuple[str, str], list[dict[str, Any]]] = {}
    events: list[CalendarEvent] = []
    for reminder in store.get_reminders(litter_id=litter_id):
        if reminder.get("enabled", True) is False:
            continue
        scope = reminder.get("owner_scope")
        owner_id = str(reminder.get("owner_id") or "")
        if scope == "puppy":
            puppy = puppies.get(owner_id)
            if puppy is None:
                continue
            owner_label = puppy_selector_label(puppy)
        elif scope == "mother":
            if owner_id != str(litter.get("mother_id") or ""):
                continue
            owner_label = "Moederhond"
        elif scope == "litter":
            owner_label = "Hele nest"
        else:
            continue
        owner_key = (str(scope), owner_id)
        if owner_key not in histories:
            try:
                histories[owner_key] = reminder_owner_records(storage, reminder)
            except ValueError:
                continue
        effective = completion_state_from_records(reminder, histories[owner_key], now)
        due = next_due_at(effective, now=now)
        if due is None:
            continue
        event = CalendarEvent(
            start=due, end=due + CARE_EVENT_DURATION,
            summary=f"Herinnering · {reminder['title']} · {owner_label}",
            uid=f"reminder:{reminder['id']}",
        )
        if _overlaps(event, start, end):
            events.append(event)
    return events


def care_calendar_events(
    runtime: PuppyTrackerRuntimeData,
    litter_id: str,
    start: datetime,
    end: datetime,
) -> list[CalendarEvent]:
    """Derive open follow-ups, care occurrences and reminders on demand."""
    if end <= start:
        return []
    storage = runtime.storage
    litter = storage.get_litter(litter_id)
    if litter is None or litter.get("active", True) is False:
        return []
    puppies = {
        str(puppy_id): puppy for puppy_id, puppy in (litter.get("puppies") or {}).items()
        if isinstance(puppy, dict) and puppy.get("active", True) is not False
    }
    records = storage.get_records(litter_id, newest_first=False)
    for puppy_id, puppy in puppies.items():
        for record in storage.get_records(litter_id, puppy_id, newest_first=False):
            record["puppy_name"] = puppy_selector_label(puppy)
            records.append(record)
    mother_id = litter.get("mother_id")
    if mother_id and hasattr(storage, "get_mother"):
        records.extend(
            record for record in storage.get_records(litter_id, mother_id=mother_id, newest_first=False)
            if record.get("litter_id") == litter_id
        )

    events: list[CalendarEvent] = []
    days_ahead = (end.date() - start.date()).days + 1
    for action in upcoming_actions(records, today=start.date(), days_ahead=days_ahead,
                                   include_overdue=False, litter_id=litter_id):
        due = date.fromisoformat(action["due_date"])
        summary = action["title"]
        if action.get("puppy_name"):
            summary = f"{summary} · {action['puppy_name']}"
        elif action.get("scope") == "mother":
            summary = f"{summary} · Moederhond"
        event = CalendarEvent(
            start=due, end=due + timedelta(days=1), summary=summary,
            uid=f"dossier:{action['source_record_id']}:{action['due_field']}",
        )
        if _overlaps(event, start, end):
            events.append(event)

    if runtime.care_programs is not None:
        result_records = {
            puppy_id: index_care_result_records(storage.get_records(litter_id, puppy_id, newest_first=False))
            for puppy_id in puppies
        }
        for program in runtime.care_programs.get_programs(litter_id=litter_id):
            if program.get("enabled", True) is False:
                continue
            try:
                occurrences = derive_litter_care_occurrences(program, list(puppies.values()))
            except (KeyError, TypeError, ValueError):
                continue
            for occurrence in occurrences:
                puppy_id = str(occurrence["puppy_id"])
                scheduled = dt_util.parse_datetime(occurrence["scheduled_at"])
                if scheduled is None:
                    continue
                if scheduled.tzinfo is None:
                    scheduled = scheduled.replace(tzinfo=dt_util.get_default_time_zone())
                event = CalendarEvent(
                    start=scheduled, end=scheduled + CARE_EVENT_DURATION,
                    summary=f"{occurrence['title']} · {puppy_selector_label(puppies[puppy_id])}",
                    uid=f"care:{occurrence['id']}",
                )
                if not _overlaps(event, start, end):
                    continue
                status = care_occurrence_status(occurrence, result_records[puppy_id].get(occurrence["id"], []))
                if status["status"] not in ("completed", "missed"):
                    events.append(event)
    events.extend(_recurring_reminder_events(runtime, litter_id, litter, puppies, start, end))
    return sorted(events, key=lambda item: (item.start_datetime_local, item.uid or ""))


class LitterCareCalendar(CalendarEntity):
    """Calendar projection of pending care, without historical dossier content."""

    _attr_icon = "mdi:calendar-heart"

    def __init__(self, entry: ConfigEntry, litter_id: str) -> None:
        self._entry = entry
        self._litter_id = litter_id
        self._attr_unique_id = f"{litter_id}_care_calendar"

    @property
    def _runtime(self) -> PuppyTrackerRuntimeData:
        return self._entry.runtime_data

    @property
    def name(self) -> str:
        litter = self._runtime.storage.get_litter(self._litter_id) or {}
        return f"{litter.get('name') or 'Nest'} geplande zorg"

    @property
    def available(self) -> bool:
        return self._runtime.storage.get_litter(self._litter_id) is not None

    @property
    def device_info(self) -> DeviceInfo:
        litter = self._runtime.storage.get_litter(self._litter_id) or {}
        return DeviceInfo(
            identifiers={(DOMAIN, f"litter_{self._litter_id}")},
            name=litter.get("name", "Nest"), manufacturer="Puppy Tracker", model="Nest",
        )

    @property
    def event(self) -> CalendarEvent | None:
        now = dt_util.now()
        events = care_calendar_events(self._runtime, self._litter_id, now, now + timedelta(days=366))
        return events[0] if events else None

    async def async_get_events(
        self, hass: HomeAssistant, start_date: datetime, end_date: datetime,
    ) -> list[CalendarEvent]:
        return care_calendar_events(self._runtime, self._litter_id, start_date, end_date)

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(async_dispatcher_connect(self.hass, SIGNAL_DASHBOARD_UPDATE, self._refresh))
        self.async_on_remove(async_track_time_interval(self.hass, self._refresh, REFRESH_INTERVAL))

    @callback
    def _refresh(self, *args: Any) -> None:
        self.async_write_ha_state()
