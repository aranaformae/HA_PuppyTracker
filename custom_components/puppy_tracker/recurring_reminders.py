"""Generic recurring care reminders for litter, mother and puppy owners."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta
from math import isfinite
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .care_programs import normalize_notification_lead_minutes
from .const import DEFAULT_NOTIFICATION_LEAD_MINUTES, DOMAIN
from .records import record_sort_key, validate_record_type
from .mother_storage import MotherScopeStorage

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


def _validated_datetime(value: Any, *, field: str) -> datetime | None:
    if value in (None, ""):
        return None
    parsed = _parse_datetime(value)
    if parsed is None:
        raise ValueError(f"{field} must be a valid datetime")
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


def normalize_reminder(
    data: dict[str, Any],
    *,
    reminder_id: str | None = None,
    updated_at: str | None = None,
) -> dict[str, Any]:
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

    record_type = validate_record_type(
        str(data.get("record_type") or "note").strip() or "note"
    )
    mode = str(data.get("schedule_mode") or "interval").strip()
    if mode not in SCHEDULE_MODES:
        raise ValueError("schedule_mode must be interval, fixed_times or once")

    interval_minutes: int | None = None
    fixed_times: list[str] = []
    due_at = _validated_datetime(data.get("due_at"), field="due_at")

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
    start_at = _validated_datetime(data.get("start_at"), field="start_at") or dt_util.now()
    last_completed_at = _validated_datetime(
        data.get("last_completed_at"), field="last_completed_at"
    )
    now = dt_util.now().isoformat()

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
        "notification_lead_minutes": normalize_notification_lead_minutes(
            data.get("notification_lead_minutes")
        ),
        "start_at": _iso(start_at),
        "due_at": _iso(due_at),
        "last_completed_at": _iso(last_completed_at),
        "manual_completed_at": _iso(_validated_datetime(
            data.get("manual_completed_at") or (data.get("last_completed_at") if not data.get("last_completed_record_id") else None),
            field="manual_completed_at")),
        "last_completed_record_id": str(data.get("last_completed_record_id") or "") or None,
        "last_completed_due_at": _iso(_validated_datetime(data.get("last_completed_due_at"), field="last_completed_due_at")),
        "created_at": str(data.get("created_at") or now),
        "updated_at": str(updated_at or data.get("updated_at") or now),
    }


def normalize_recurring_reminder_backup_data(data: Any) -> dict[str, Any]:
    """Validate one portable recurring-reminder store snapshot.

    Active reminders must be readable by this version. Quarantined definitions
    remain opaque and are copied verbatim so backup/restore never destroys a
    future definition simply because the current runtime cannot parse it.
    """
    if not isinstance(data, dict):
        raise ValueError("Recurring reminder backup data must be an object")
    reminders = data.get("reminders")
    if not isinstance(reminders, dict):
        raise ValueError("Recurring reminder backup reminders must be an object")
    quarantined = data.get("quarantined_reminders", {})
    if not isinstance(quarantined, dict):
        raise ValueError("Recurring reminder backup quarantine must be an object")

    normalized: dict[str, dict[str, Any]] = {}
    for key, value in reminders.items():
        reminder_id = str(key)
        if not reminder_id or not isinstance(value, dict):
            raise ValueError("Recurring reminder backup contains an invalid reminder")
        normalized[reminder_id] = normalize_reminder(value, reminder_id=reminder_id)

    normalized_quarantine = {str(key): deepcopy(value) for key, value in quarantined.items()}
    overlap = set(normalized) & set(normalized_quarantine)
    if overlap:
        raise ValueError("Recurring reminder backup contains duplicate active/quarantined identifiers")

    result: dict[str, Any] = {"reminders": normalized}
    if normalized_quarantine:
        result["quarantined_reminders"] = normalized_quarantine
    return result


def reminder_matches_record(reminder: dict[str, Any], record: dict[str, Any]) -> bool:
    """Return whether a dossier record completes a reminder."""
    if not reminder.get("enabled", True) or record.get("deleted"):
        return False
    if str(record.get("type") or "") != str(reminder.get("record_type") or ""):
        return False
    data = record.get("data") or {}
    if isinstance(data, dict) and data.get("recurring_reminder_id"):
        return data["recurring_reminder_id"] == reminder.get("id")
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

    # Fixed clock times belong to the local clock represented by ``now``.
    # Runtime callers pass Home Assistant local time already, while tests and
    # other API consumers may pass another explicit aware timezone. Converting
    # an explicit aware ``now`` through HA's process default timezone changes
    # the requested wall-clock schedule (for example 14:00 Amsterdam becomes
    # 05:00/08:00 Pacific), so preserve the caller's timezone here.
    local_now = now if now.tzinfo is not None else dt_util.as_local(now)
    tz = local_now.tzinfo
    consumed = _parse_datetime(reminder.get("last_completed_due_at"))
    anchor = max(value for value in (start, last, consumed) if value is not None)
    local_anchor = anchor.astimezone(tz) if tz is not None else anchor
    for day_offset in range(0, 2):
        day = (local_anchor + timedelta(days=day_offset)).date()
        for text in times:
            hour, minute = (int(part) for part in text.split(":"))
            candidate = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
            if candidate >= start and (last is None or candidate > last) and (consumed is None or candidate > consumed):
                return candidate
    return None


def reminder_status(
    reminder: dict[str, Any],
    *,
    now: datetime | None = None,
    notification_lead_minutes: int = DEFAULT_NOTIFICATION_LEAD_MINUTES,
) -> dict[str, Any]:
    """Return derived due status for dashboard/API consumers."""
    now = now or dt_util.now()
    due = next_due_at(reminder, now=now)
    if due is None:
        status = "completed" if reminder.get("schedule_mode") == "once" else "disabled"
        return {
            **deepcopy(reminder),
            "next_due_at": None,
            "status": status,
            "minutes_until_due": None,
        }
    minutes = int((due - now).total_seconds() // 60)
    lead_minutes = int(
        reminder.get("notification_lead_minutes")
        if reminder.get("notification_lead_minutes") is not None
        else notification_lead_minutes
    )
    if not 0 <= lead_minutes <= 10080:
        lead_minutes = DEFAULT_NOTIFICATION_LEAD_MINUTES
    if minutes < 0:
        status = "overdue"
    elif minutes <= lead_minutes:
        status = "due_soon"
    else:
        status = "upcoming"
    return {
        **deepcopy(reminder),
        "next_due_at": due.isoformat(),
        "status": status,
        "minutes_until_due": minutes,
    }


def validate_reminder_owner(storage, reminder: dict[str, Any]) -> None:
    litter_id, scope, owner_id = (str(reminder.get(key) or "") for key in ("litter_id", "owner_scope", "owner_id"))
    if storage.get_litter(litter_id) is None:
        raise ValueError("Unknown litter")
    if scope == "litter":
        return
    if scope == "puppy" and storage.get_puppy(litter_id, owner_id) is not None:
        return
    if scope == "mother" and isinstance(storage, MotherScopeStorage):
        mother = storage.get_mother_for_litter(litter_id)
        if mother is not None and str(mother.get("id")) == owner_id:
            return
    raise ValueError("Unknown reminder owner for this litter")


def reminder_owner_records(storage, reminder: dict[str, Any]) -> list[dict[str, Any]]:
    validate_reminder_owner(storage, reminder)
    litter_id, scope, owner_id = (str(reminder[key]) for key in ("litter_id", "owner_scope", "owner_id"))
    if scope == "mother":
        return [record for record in storage.get_records(litter_id, mother_id=owner_id)
                if record.get("litter_id") == litter_id]
    return storage.get_records(litter_id, owner_id if scope == "puppy" else None)


def _completion_state(reminder: dict[str, Any], records: list[dict[str, Any]], now: datetime) -> dict[str, Any]:
    manual = _parse_datetime(reminder.get("manual_completed_at"))
    if manual is None and not reminder.get("last_completed_record_id"):
        manual = _parse_datetime(reminder.get("last_completed_at"))
    matches = [record for record in records if reminder_matches_record(reminder, record)
               and (occurred := _parse_datetime(record.get("occurred_at"))) is not None and occurred <= now]
    if manual:
        matches = [record for record in matches if _parse_datetime(record.get("occurred_at")) > manual]
    if not matches and not reminder.get("last_completed_record_id"):
        return reminder
    newest = max(matches, key=record_sort_key) if matches else None
    data = (newest.get("data") or {}) if newest else {}
    return {**reminder, "last_completed_at": newest.get("occurred_at") if newest else _iso(manual),
            "last_completed_record_id": newest.get("id") if newest else None,
            "last_completed_due_at": _iso(_parse_datetime(data.get("recurring_due_at"))) if isinstance(data, dict) else None}


class RecurringReminderStore:
    """Persistent store for generic recurring reminders."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self._data: dict[str, Any] = {"reminders": {}}
        self._lock = asyncio.Lock()

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        reminders = loaded.get("reminders", {}) if isinstance(loaded, dict) else {}
        quarantined = (
            deepcopy(loaded.get("quarantined_reminders", {}))
            if isinstance(loaded, dict)
            and isinstance(loaded.get("quarantined_reminders"), dict)
            else {}
        )
        normalized: dict[str, dict[str, Any]] = {}
        if isinstance(reminders, dict):
            for key, value in reminders.items():
                if not isinstance(value, dict):
                    quarantined[str(key)] = deepcopy(value)
                    continue
                try:
                    item = normalize_reminder(value, reminder_id=str(key))
                except ValueError:
                    # Preserve unreadable/future records rather than silently
                    # deleting them during startup normalization.
                    quarantined[str(key)] = deepcopy(value)
                    continue
                normalized[item["id"]] = item
                quarantined.pop(item["id"], None)
        data: dict[str, Any] = {"reminders": normalized}
        if quarantined:
            data["quarantined_reminders"] = quarantined
        self._data = data
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

    def get_quarantined_reminder_count(self) -> int:
        """Return the number of preserved reminders that could not be normalized."""
        value = self._data.get("quarantined_reminders", {})
        return len(value) if isinstance(value, dict) else 0

    def get_backup_data(self) -> dict[str, Any]:
        """Return the complete portable store snapshot, including quarantine."""
        return deepcopy(self._data)

    async def async_restore_backup_data(self, data: dict[str, Any]) -> None:
        """Atomically replace the portable store snapshot."""
        restored = normalize_recurring_reminder_backup_data(data)
        async with self._lock:
            previous = deepcopy(self._data)
            self._data = restored
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                try:
                    await self._store.async_save(self._data)
                except Exception:
                    pass
                raise

    async def async_create(self, data: dict[str, Any]) -> str:
        item = normalize_reminder(data)
        async with self._lock:
            previous = deepcopy(self._data)
            self._data.setdefault("reminders", {})[item["id"]] = item
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                raise
        return item["id"]

    async def async_update(self, reminder_id: str, data: dict[str, Any]) -> None:
        async with self._lock:
            current = self.get_reminder(reminder_id)
            if current is None:
                raise ValueError("Unknown reminder")
            item = normalize_reminder({**current, **deepcopy(data)}, reminder_id=reminder_id,
                                      updated_at=dt_util.now().isoformat())
            previous = deepcopy(self._data)
            self._data["reminders"][reminder_id] = item
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                raise

    async def async_delete(self, reminder_id: str) -> None:
        async with self._lock:
            if reminder_id not in self._data.get("reminders", {}):
                raise ValueError("Unknown reminder")
            previous = deepcopy(self._data)
            del self._data["reminders"][reminder_id]
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                raise

    async def async_reconcile_records(self, storage, *, litter_id: str | None = None) -> None:
        """Derive completion from active history, including corrections and deletions."""
        async with self._lock:
            previous = deepcopy(self._data)
            now = dt_util.now()
            histories = {}
            for reminder in self.get_reminders(litter_id=litter_id):
                if not reminder.get("enabled", True):
                    continue
                owner = tuple(reminder[key] for key in ("litter_id", "owner_scope", "owner_id"))
                if owner not in histories:
                    try:
                        histories[owner] = reminder_owner_records(storage, reminder)
                    except ValueError:
                        histories[owner] = []
                updated = _completion_state(reminder, histories[owner], now)
                if updated != reminder:
                    updated["updated_at"] = now.isoformat()
                    self._data["reminders"][reminder["id"]] = updated
            if self._data == previous:
                return
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                raise

    async def async_record_completion(self, storage, reminder_id: str, *, due_at: str,
                                      expected_updated_at: str, occurred_at: str,
                                      title: str | None = None, note: str | None = None,
                                      data: dict[str, Any] | None = None) -> dict[str, Any]:
        """Save one authoritative execution; reminder state is a recoverable projection."""
        async with self._lock:
            reminder = self.get_reminder(reminder_id)
            if reminder is None or not reminder.get("enabled", True):
                raise ValueError("This reminder no longer exists or is disabled. Refresh the card")
            records = reminder_owner_records(storage, reminder)
            due = _validated_datetime(due_at, field="due_at")
            for record in records:
                details = record.get("data") or {}
                if reminder_matches_record(reminder, record) and isinstance(details, dict) and details.get("recurring_reminder_id") == reminder_id and _parse_datetime(details.get("recurring_due_at")) == due:
                    return {"record": record, "record_id": record["id"], "already_completed": True}
            if reminder.get("updated_at") != expected_updated_at:
                raise ValueError("This reminder has changed. Refresh the card")
            now = dt_util.now()
            effective = _completion_state(reminder, records, now)
            if due is None or next_due_at(effective, now=now) != due:
                raise ValueError("This scheduled moment has changed or was already completed. Refresh the card")
            occurred = _validated_datetime(occurred_at, field="occurred_at")
            last = _parse_datetime(effective.get("last_completed_at"))
            start = _parse_datetime(reminder.get("start_at"))
            if occurred is None or occurred > now or (start and occurred < start - timedelta(seconds=1)) or (last and occurred <= last):
                raise ValueError("Choose an execution time after the previous execution and not in the future")
            payload = deepcopy(data or {})
            record_type = reminder["record_type"]
            if record_type == "temperature":
                try:
                    value = float(payload.get("temperature_c"))
                except (TypeError, ValueError):
                    raise ValueError("Enter a valid temperature") from None
                if not isfinite(value) or not 20 <= value <= 45:
                    raise ValueError("Enter a valid temperature")
            required = {"deworming": "product", "vaccination": "vaccine"}.get(record_type)
            if required and not str(payload.get(required) or "").strip():
                raise ValueError(f"Enter the {required} used for this execution")
            payload.update(recurring_reminder_id=reminder_id, recurring_due_at=due.isoformat())
            scope, litter_id = reminder["owner_scope"], reminder["litter_id"]
            owner = {"mother_id": reminder["owner_id"]} if scope == "mother" else {"puppy_id": reminder["owner_id"]} if scope == "puppy" else {}
            record_id = await storage.async_add_record(litter_id, **owner, record_type=record_type,
                occurred_at=occurred.isoformat(), title=title or reminder.get("match_title") or reminder["title"], note=note, data=payload)
            return {"record": storage.get_record(litter_id, record_id, **owner), "record_id": record_id, "already_completed": False}

    async def async_undo_completion(self, storage, reminder_id: str, *, record_id: str,
                                    expected_record_updated_at: str) -> dict[str, Any]:
        """Undo only the unchanged latest execution, atomically with dossier edits."""
        async with self._lock:
            reminder = self.get_reminder(reminder_id)
            if reminder is None or not reminder.get("enabled", True):
                raise ValueError("This reminder no longer exists or is disabled. Refresh the card")
            litter_id, scope = reminder["litter_id"], reminder["owner_scope"]

            def validate(record, records):
                validate_reminder_owner(storage, reminder)
                data = record.get("data") or {}
                if (record.get("deleted") or record.get("litter_id") != litter_id
                    or record.get("scope") != scope
                    or not isinstance(data, dict) or data.get("recurring_reminder_id") != reminder_id
                    or not expected_record_updated_at or record.get("updated_at") != expected_record_updated_at):
                    raise ValueError("This execution has changed. Refresh the card")
                history = [item for item in records if item.get("litter_id") == litter_id]
                latest = _completion_state(reminder, history, dt_util.now())
                if latest.get("last_completed_record_id") != record_id:
                    raise ValueError("A newer execution exists. Refresh the card")

            owner = {"mother_id": reminder["owner_id"]} if scope == "mother" else {"puppy_id": reminder["owner_id"]} if scope == "puppy" else {}
            await storage.async_delete_record(litter_id, record_id, **owner, validate_delete=validate)
            return storage.get_record(litter_id, record_id, **owner)
