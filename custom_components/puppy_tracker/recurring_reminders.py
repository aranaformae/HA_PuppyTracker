"""Generic recurring care reminders for litter, mother and puppy owners."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN

STORE_KEY = f"{DOMAIN}_recurring_reminders"
STORE_VERSION = 1
OWNER_SCOPES = {"litter", "mother", "puppy"}
SCHEDULE_MODES = {"interval", "fixed_times", "once"}


def _parse_datetime(value: Any) -> datetime | None:
    if not value:
        return None
    parsed = dt_util.parse_datetime(str(value))
    if parsed is None:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_util.get_default_time_zone())
    return parsed


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _normalize_times(values: Any) -> list[str]:
    if not isinstance(values, list):
        return []
    result: list[str] = []
    for value in values:
        text = str(value or "").strip()
        parts = text.split(":")
        if len(parts) != 2:
            continue
        try:
            hour, minute = int(parts[0]), int(parts[1])
        except ValueError:
            continue
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            normalized = f"{hour:02d}:{minute:02d}"
            if normalized not in result:
                result.append(normalized)
    return sorted(result)


def normalize_reminder(data: dict[str, Any], *, reminder_id: str | None = None) -> dict[str, Any]:
    """Validate and normalize one generic reminder."""
    owner_scope = str(data.get("owner_scope") or "").strip()
    if owner_scope not in OWNER_SCOPES:
        raise ValueError("owner_scope must be litter, mother or puppy")

    litter_id = str(data.get("litter_id") or "").strip()
    if not litter_id:
        raise ValueError("litter_id is required")

    owner_id = str(data.get("owner_id") or "").strip() or None
    if owner_scope in {"mother", "puppy"} and not owner_id:
        raise ValueError("owner_id is required for mother and puppy reminders")
    if owner_scope == "litter":
        owner_id = litter_id

    title = str(data.get("title") or "").strip()
    if not title:
        raise ValueError("title is required")

    record_type = str(data.get("record_type") or "note").strip() or "note"
    mode = str(data.get("schedule_mode") or "interval").strip()
    if mode not in SCHEDULE_MODES:
        raise ValueError("schedule_mode must be interval, fixed_times or once")

    interval_minutes: int | None = None
    fixed_times: list[str] = []
    due_at = _parse_datetime(data.get("due_at"))

    if mode == "interval":
        try:
            interval_minutes = int(data.get("interval_minutes"))
        except (TypeError, ValueError) as err:
            raise ValueError("interval_minutes is required") from err
        if not 1 <= interval_minutes <= 525600:
            raise ValueError("interval_minutes must be between 1 and 525600")
    elif mode == "fixed_times":
        fixed_times = _normalize_times(data.get("fixed_times"))
        if not fixed_times:
            raise ValueError("fixed_times requires at least one HH:MM time")
    elif due_at is None:
        raise ValueError("due_at is required for one-time reminders")

    match_title = str(data.get("match_title") or "").strip() or None
    start_at = _parse_datetime(data.get("start_at")) or dt_util.now()
    last_completed_at = _parse_datetime(data.get("last_completed_at"))

    return {
        "id": reminder_id or str(data.get("id") or uuid4()),
        "enabled": bool(data.get("enabled", True)),
        "title": title,
        "owner_scope": owner_scope,
        "owner_id": owner_id,
        "litter_id": litter_id,
        "record_type": record_type,
        "match_title": match_title,
        "schedule_mode": mode,
        "interval_minutes": interval_minutes,
        "fixed_times": fixed_times,
        "start_at": _iso(start_at),
        "due_at": _iso(due_at),
        "last_completed_at": _iso(last_completed_at),
        "last_completed_record_id": str(data.get("last_completed_record_id") or "") or None,
        "created_at": str(data.get("created_at") or dt_util.now().isoformat()),
        "updated_at": dt_util.now().isoformat(),
    }


def reminder_matches_record(reminder: dict[str, Any], record: dict[str, Any]) -> bool:
    """Return whether a dossier record completes a reminder."""
    if not reminder.get("enabled", True) or record.get("deleted"):
        return False
    if str(record.get("type") or "") != str(reminder.get("record_type") or ""):
        return False
    match_title = str(reminder.get("match_title") or "").strip().casefold()
    if match_title and str(record.get("title") or "").strip().casefold() != match_title:
        return False
    return True


def next_due_at(reminder: dict[str, Any], *, now: datetime | None = None) -> datetime | None:
    """Calculate the next due instant for one reminder."""
    if not reminder.get("enabled", True):
        return None
    now = now or dt_util.now()
    mode = reminder.get("schedule_mode")
    last = _parse_datetime(reminder.get("last_completed_at"))
    start = _parse_datetime(reminder.get("start_at")) or now

    if mode == "once":
        if last is not None:
            return None
        return _parse_datetime(reminder.get("due_at"))

    if mode == "interval":
        minutes = int(reminder.get("interval_minutes") or 0)
        if minutes <= 0:
            return None
        base = last or start
        return base + timedelta(minutes=minutes)

    times = _normalize_times(reminder.get("fixed_times"))
    if not times:
        return None
    local_now = dt_util.as_local(now)
    tz = local_now.tzinfo
    for day_offset in range(0, 8):
        day = (local_now + timedelta(days=day_offset)).date()
        for text in times:
            hour, minute = (int(part) for part in text.split(":"))
            candidate = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
            if candidate > local_now and (last is None or candidate > dt_util.as_local(last)):
                return candidate
    return None


def reminder_status(reminder: dict[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    """Return derived due status for dashboard/API consumers."""
    now = now or dt_util.now()
    due = next_due_at(reminder, now=now)
    if due is None:
        status = "completed" if reminder.get("schedule_mode") == "once" else "disabled"
        return {**deepcopy(reminder), "next_due_at": None, "status": status, "minutes_until_due": None}
    minutes = int((due - now).total_seconds() // 60)
    if minutes < 0:
        status = "overdue"
    elif minutes <= 60:
        status = "due_soon"
    else:
        status = "upcoming"
    return {**deepcopy(reminder), "next_due_at": due.isoformat(), "status": status, "minutes_until_due": minutes}


class RecurringReminderStore:
    """Persistent store for generic recurring reminders."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self._data: dict[str, Any] = {"reminders": {}}
        self._lock = asyncio.Lock()

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        reminders = loaded.get("reminders", {}) if isinstance(loaded, dict) else {}
        normalized: dict[str, dict[str, Any]] = {}
        if isinstance(reminders, dict):
            for key, value in reminders.items():
                if not isinstance(value, dict):
                    continue
                try:
                    item = normalize_reminder(value, reminder_id=str(key))
                except ValueError:
                    continue
                normalized[item["id"]] = item
        self._data = {"reminders": normalized}
        if loaded != self._data:
            await self._store.async_save(self._data)

    def get_reminders(self, *, litter_id: str | None = None) -> list[dict[str, Any]]:
        values = list(self._data.get("reminders", {}).values())
        if litter_id:
            values = [item for item in values if item.get("litter_id") == litter_id]
        return [deepcopy(item) for item in values]

    def get_reminder(self, reminder_id: str) -> dict[str, Any] | None:
        item = self._data.get("reminders", {}).get(reminder_id)
        return deepcopy(item) if isinstance(item, dict) else None

    async def async_create(self, data: dict[str, Any]) -> str:
        item = normalize_reminder(data)
        async with self._lock:
            self._data.setdefault("reminders", {})[item["id"]] = item
            await self._store.async_save(self._data)
        return item["id"]

    async def async_update(self, reminder_id: str, data: dict[str, Any]) -> None:
        current = self.get_reminder(reminder_id)
        if current is None:
            raise ValueError("Unknown reminder")
        item = normalize_reminder({**current, **deepcopy(data)}, reminder_id=reminder_id)
        async with self._lock:
            self._data["reminders"][reminder_id] = item
            await self._store.async_save(self._data)

    async def async_delete(self, reminder_id: str) -> None:
        async with self._lock:
            if reminder_id not in self._data.get("reminders", {}):
                raise ValueError("Unknown reminder")
            del self._data["reminders"][reminder_id]
            await self._store.async_save(self._data)

    async def async_mark_completed(self, reminder_id: str, *, occurred_at: str, record_id: str | None = None) -> None:
        current = self.get_reminder(reminder_id)
        if current is None:
            raise ValueError("Unknown reminder")
        current["last_completed_at"] = occurred_at
        current["last_completed_record_id"] = record_id
        await self.async_update(reminder_id, current)

    async def async_match_record(
        self,
        *,
        litter_id: str,
        owner_scope: str,
        owner_id: str,
        record: dict[str, Any],
    ) -> list[str]:
        """Complete matching reminders for exactly the record owner."""
        matched: list[str] = []
        occurred_at = str(record.get("occurred_at") or record.get("created_at") or dt_util.now().isoformat())
        for reminder in self.get_reminders(litter_id=litter_id):
            if reminder.get("owner_scope") != owner_scope or str(reminder.get("owner_id")) != str(owner_id):
                continue
            if not reminder_matches_record(reminder, record):
                continue
            previous = _parse_datetime(reminder.get("last_completed_at"))
            occurred = _parse_datetime(occurred_at)
            if previous is not None and occurred is not None and occurred <= previous:
                continue
            await self.async_mark_completed(reminder["id"], occurred_at=occurred_at, record_id=record.get("id"))
            matched.append(reminder["id"])
        return matched
