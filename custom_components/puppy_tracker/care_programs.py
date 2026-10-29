"""Care program model for age schedules and finite puppy treatments."""

from __future__ import annotations

from collections.abc import Callable
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN
from .records import validate_record_type
from .storage_lock import CoordinatedLock, mutation_coordinator

STORE_KEY = f"{DOMAIN}_care_programs"
STORE_VERSION = 1
SCHEDULE_TYPES = {"once", "range", "course"}
RESULT_FIELDS = {"result", "score", "note"}
DEFAULT_RESULT_FIELDS = ["result", "note"]
MAX_AGE_DAYS = 3650
MAX_NOTIFICATION_LEAD_MINUTES = 10080
MAX_COURSE_DAYS = 56
MAX_COURSE_TIMES = 8
# These fields define what a scheduled occurrence means. Once results exist,
# changing them would make old completion records ambiguous. Presentation-only
# description and operational enabled/notification toggles are intentionally
# excluded.
OCCURRENCE_IDENTITY_FIELDS = (
    "title",
    "record_type",
    "schedule_type",
    "start_age_days",
    "end_age_days",
    "interval_days",
    "time_of_day",
    "result_fields",
    "target_puppy_ids",
    "start_date",
    "end_date",
    "times_of_day",
    "timezone",
    "treatment_product",
    "planned_dose",
    "planned_unit",
    "planned_route",
)


def _normalize_time_of_day(value: Any) -> str | None:
    text = str(value or "").strip()
    if not text:
        return None
    parts = text.split(":")
    if len(parts) != 2:
        raise ValueError("time_of_day must be HH:MM")
    try:
        hour, minute = int(parts[0]), int(parts[1])
    except ValueError as err:
        raise ValueError("time_of_day must be HH:MM") from err
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError("time_of_day must be HH:MM")
    return f"{hour:02d}:{minute:02d}"


def _normalize_age(value: Any, *, field: str) -> int:
    try:
        age = int(value)
    except (TypeError, ValueError) as err:
        raise ValueError(f"{field} is required") from err
    if not 0 <= age <= MAX_AGE_DAYS:
        raise ValueError(f"{field} must be between 0 and {MAX_AGE_DAYS}")
    return age


def _normalize_course(data: dict[str, Any], record_type: str) -> dict[str, Any]:
    """Validate a finite, explicitly targeted puppy treatment schedule."""
    if record_type not in {"medication", "deworming"}:
        raise ValueError("course record_type must be medication or deworming")
    targets = data.get("target_puppy_ids")
    if not isinstance(targets, list) or not targets or len(targets) > 30:
        raise ValueError("course requires 1 to 30 selected puppies")
    puppy_ids = [str(item).strip() for item in targets]
    if any(not item for item in puppy_ids) or len(set(puppy_ids)) != len(puppy_ids):
        raise ValueError("course puppy selection contains an empty or duplicate id")
    try:
        start = date.fromisoformat(str(data.get("start_date") or ""))
        end = date.fromisoformat(str(data.get("end_date") or ""))
    except ValueError as err:
        raise ValueError("course start_date and end_date must be ISO dates") from err
    if not 0 <= (end - start).days < MAX_COURSE_DAYS:
        raise ValueError("course must span 1 to 56 calendar days")
    raw_times = data.get("times_of_day")
    if not isinstance(raw_times, list) or not 1 <= len(raw_times) <= MAX_COURSE_TIMES:
        raise ValueError("course requires 1 to 8 daily times")
    times = [_normalize_time_of_day(value) for value in raw_times]
    if any(value is None for value in times) or len(set(times)) != len(times):
        raise ValueError("course times must be unique HH:MM values")
    zone_name = str(data.get("timezone") or dt_util.get_default_time_zone())
    try:
        zone = ZoneInfo(zone_name)
    except (ZoneInfoNotFoundError, ValueError) as err:
        raise ValueError("course timezone is invalid") from err
    # Never silently move or duplicate a dose across a DST transition.
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        for clock in times:
            hour, minute = (int(part) for part in clock.split(":"))
            moment = datetime(day.year, day.month, day.day, hour, minute, tzinfo=zone)
            if (
                moment.astimezone(timezone.utc).astimezone(zone).replace(tzinfo=None)
                != moment.replace(tzinfo=None)
                or moment.utcoffset() != moment.replace(fold=1).utcoffset()
            ):
                raise ValueError(f"course time {day.isoformat()} {clock} needs DST review")
    product = str(data.get("treatment_product") or "").strip()
    if not product:
        raise ValueError("course treatment_product is required")
    return {
        "target_puppy_ids": puppy_ids,
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "times_of_day": sorted(times),
        "timezone": zone_name,
        "treatment_product": product,
        "planned_dose": str(data.get("planned_dose") or "").strip() or None,
        "planned_unit": str(data.get("planned_unit") or "").strip() or None,
        "planned_route": str(data.get("planned_route") or "").strip() or None,
    }


def _normalize_result_fields(value: Any) -> list[str]:
    if value is None:
        return list(DEFAULT_RESULT_FIELDS)
    if not isinstance(value, list):
        raise ValueError("result_fields must be a list")
    normalized: list[str] = []
    for item in value:
        field = str(item or "").strip()
        if field not in RESULT_FIELDS:
            raise ValueError(f"Unsupported result field: {field}")
        if field not in normalized:
            normalized.append(field)
    return normalized


def _normalize_revision(value: Any) -> int:
    try:
        revision = 1 if value in (None, "") else int(value)
    except (TypeError, ValueError) as err:
        raise ValueError("revision must be a positive integer") from err
    if revision < 1:
        raise ValueError("revision must be a positive integer")
    return revision


def normalize_notification_lead_minutes(value: Any) -> int | None:
    """Return an optional notification lead time in whole minutes."""
    if value in (None, ""):
        return None
    try:
        minutes = int(value)
    except (TypeError, ValueError) as err:
        raise ValueError("notification_lead_minutes must be a whole number") from err
    if not 0 <= minutes <= MAX_NOTIFICATION_LEAD_MINUTES:
        raise ValueError(
            f"notification_lead_minutes must be between 0 and {MAX_NOTIFICATION_LEAD_MINUTES}"
        )
    return minutes


def care_program_identity_changed(
    current: dict[str, Any], candidate: dict[str, Any]
) -> bool:
    """Return whether an update changes occurrence identity semantics."""
    return any(
        current.get(field) != candidate.get(field)
        for field in OCCURRENCE_IDENTITY_FIELDS
    )


def normalize_care_program(
    data: dict[str, Any],
    *,
    program_id: str | None = None,
    updated_at: str | None = None,
) -> dict[str, Any]:
    """Validate and normalize one care program."""
    litter_id = str(data.get("litter_id") or "").strip()
    if not litter_id:
        raise ValueError("litter_id is required")

    title = str(data.get("title") or "").strip()
    if not title:
        raise ValueError("title is required")

    schedule_type = str(data.get("schedule_type") or "").strip()
    if schedule_type not in SCHEDULE_TYPES:
        raise ValueError("schedule_type must be once, range or course")

    record_type = validate_record_type(str(data.get("record_type") or "note").strip() or "note")
    course = _normalize_course(data, record_type) if schedule_type == "course" else None
    start_age_days: int | None = None
    end_age_days: int | None = None
    interval_days: int | None = None
    if course is None:
        start_age_days = _normalize_age(data.get("start_age_days"), field="start_age_days")
        end_age_days = start_age_days
        if schedule_type == "range":
            end_age_days = _normalize_age(data.get("end_age_days"), field="end_age_days")
            if end_age_days < start_age_days:
                raise ValueError("end_age_days must be on or after start_age_days")
            try:
                interval_days = int(data.get("interval_days", 1))
            except (TypeError, ValueError) as err:
                raise ValueError("interval_days must be a positive integer") from err
            if interval_days < 1:
                raise ValueError("interval_days must be a positive integer")

    description = str(data.get("description") or "").strip() or None
    time_of_day = None if course else _normalize_time_of_day(data.get("time_of_day"))
    result_fields = _normalize_result_fields(data.get("result_fields"))
    instructions = str(data.get("instructions") or "").strip() or None
    instructions_by_age = {} if course else data.get("instructions_by_age") or {}
    if not isinstance(instructions_by_age, dict):
        raise ValueError("instructions_by_age must be an object")
    normalized_instructions_by_age: dict[str, str] = {}
    for key, value in instructions_by_age.items():
        try:
            age = int(key)
        except (TypeError, ValueError) as err:
            raise ValueError("instructions_by_age keys must be ages in days") from err
        if not 0 <= age <= MAX_AGE_DAYS:
            raise ValueError(f"instructions_by_age keys must be between 0 and {MAX_AGE_DAYS}")
        text = str(value).strip()
        if text:
            normalized_instructions_by_age[str(age)] = text
    revision = _normalize_revision(data.get("revision", 1))
    stopped_at = str(data.get("stopped_at") or "").strip() or None
    stop_reason = str(data.get("stop_reason") or "").strip() or None
    if stopped_at or stop_reason:
        if course is None or not stopped_at or not stop_reason or dt_util.parse_datetime(stopped_at) is None:
            raise ValueError("A stopped treatment requires a reason and valid stopped_at")
        if data.get("enabled", True):
            raise ValueError("A stopped treatment cannot be enabled")
    now = dt_util.now().isoformat()

    return {
        "id": program_id or str(data.get("id") or uuid4()),
        "revision": revision,
        "litter_id": litter_id,
        "enabled": bool(data.get("enabled", True)),
        "counts_for_attention": bool(data.get("counts_for_attention", True)),
        "title": title,
        "description": description,
        "record_type": record_type,
        "schedule_type": schedule_type,
        "start_age_days": start_age_days,
        "end_age_days": end_age_days,
        "interval_days": interval_days,
        "time_of_day": time_of_day,
        "notifications_enabled": bool(data.get("notifications_enabled", True)),
        "notification_lead_minutes": normalize_notification_lead_minutes(
            data.get("notification_lead_minutes")
        ),
        "result_fields": result_fields,
        "instructions": instructions,
        "instructions_by_age": normalized_instructions_by_age,
        "target_puppy_ids": course["target_puppy_ids"] if course else None,
        "start_date": course["start_date"] if course else None,
        "end_date": course["end_date"] if course else None,
        "times_of_day": course["times_of_day"] if course else None,
        "timezone": course["timezone"] if course else None,
        "treatment_product": course["treatment_product"] if course else None,
        "planned_dose": course["planned_dose"] if course else None,
        "planned_unit": course["planned_unit"] if course else None,
        "planned_route": course["planned_route"] if course else None,
        "stopped_at": stopped_at,
        "stop_reason": stop_reason,
        "created_at": str(data.get("created_at") or now),
        "updated_at": str(updated_at or data.get("updated_at") or now),
    }


def normalize_care_program_backup_data(data: Any) -> dict[str, Any]:
    """Validate one portable care-program store snapshot.

    Active program definitions must be readable by this version. Quarantined
    entries are intentionally opaque and preserved verbatim so a newer/future
    definition is never destroyed merely by backup/restore.
    """
    if not isinstance(data, dict):
        raise ValueError("Care program backup data must be an object")
    programs = data.get("programs")
    if not isinstance(programs, dict):
        raise ValueError("Care program backup programs must be an object")
    quarantined = data.get("quarantined_programs", {})
    if not isinstance(quarantined, dict):
        raise ValueError("Care program backup quarantine must be an object")

    normalized: dict[str, dict[str, Any]] = {}
    for key, value in programs.items():
        program_id = str(key)
        if not program_id or not isinstance(value, dict):
            raise ValueError("Care program backup contains an invalid program")
        item = normalize_care_program(value, program_id=program_id)
        normalized[program_id] = item

    normalized_quarantine = {str(key): deepcopy(value) for key, value in quarantined.items()}
    overlap = set(normalized) & set(normalized_quarantine)
    if overlap:
        raise ValueError("Care program backup contains duplicate active/quarantined identifiers")

    result: dict[str, Any] = {"programs": normalized}
    if normalized_quarantine:
        result["quarantined_programs"] = normalized_quarantine
    return result


class AgeBasedCareProgramStore:
    """Persistent storage for litter-specific care programs."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self._data: dict[str, Any] = {"programs": {}}
        self._lock = CoordinatedLock(mutation_coordinator(hass))

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        programs = loaded.get("programs", {}) if isinstance(loaded, dict) else {}
        quarantined = deepcopy(loaded.get("quarantined_programs", {})) if isinstance(loaded, dict) and isinstance(loaded.get("quarantined_programs"), dict) else {}
        normalized: dict[str, dict[str, Any]] = {}
        if isinstance(programs, dict):
            for key, value in programs.items():
                if not isinstance(value, dict):
                    quarantined[str(key)] = deepcopy(value)
                    continue
                try:
                    item = normalize_care_program(value, program_id=str(key))
                except ValueError:
                    # Preserve unreadable/future data instead of silently
                    # deleting it on the next store save.
                    quarantined[str(key)] = deepcopy(value)
                    continue
                normalized[item["id"]] = item
                quarantined.pop(item["id"], None)
        data: dict[str, Any] = {"programs": normalized}
        if quarantined:
            data["quarantined_programs"] = quarantined
        self._data = data
        if loaded != self._data:
            await self._store.async_save(self._data)

    def get_programs(self, *, litter_id: str | None = None) -> list[dict[str, Any]]:
        """Return programs, optionally filtered to one litter."""
        values = list(self._data.get("programs", {}).values())
        if litter_id:
            values = [item for item in values if item.get("litter_id") == litter_id]
        return [deepcopy(item) for item in values]

    def get_program(self, program_id: str) -> dict[str, Any] | None:
        """Return one program by id."""
        item = self._data.get("programs", {}).get(program_id)
        return deepcopy(item) if isinstance(item, dict) else None

    def get_quarantined_program_count(self) -> int:
        """Return the number of preserved programs that could not be normalized."""
        value = self._data.get("quarantined_programs", {})
        return len(value) if isinstance(value, dict) else 0

    def get_backup_data(self) -> dict[str, Any]:
        """Return the complete portable store snapshot, including quarantine."""
        return deepcopy(self._data)

    async def async_restore_backup_data(self, data: dict[str, Any]) -> None:
        """Atomically replace the portable store snapshot."""
        restored = normalize_care_program_backup_data(data)
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
        """Create one care program."""
        item = normalize_care_program(data)
        async with self._lock:
            previous = deepcopy(self._data)
            self._data.setdefault("programs", {})[item["id"]] = item
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                raise
        return item["id"]

    async def async_update(
        self, program_id: str, data: dict[str, Any], *,
        active_result_exists: Callable[[dict[str, Any]], bool] | None = None,
    ) -> None:
        """Update one care program and revision its semantic identity."""
        async with self._lock:
            current = self._data.get("programs", {}).get(program_id)
            if not isinstance(current, dict):
                raise ValueError("Unknown care program")
            if current.get("stopped_at"):
                raise ValueError("A stopped treatment is read-only")
            merged = {**current, **deepcopy(data)}
            if str(merged.get("litter_id") or "") != str(current.get("litter_id") or ""):
                raise ValueError("litter_id cannot be changed for an existing care program")
            item = normalize_care_program(
                merged, program_id=program_id, updated_at=dt_util.now().isoformat(),
            )
            identity_changed = care_program_identity_changed(current, item)
            if identity_changed and active_result_exists and active_result_exists(current):
                raise ValueError("Care program schedule cannot change after results exist")
            if identity_changed:
                item["revision"] = int(current.get("revision") or 1) + 1
            else:
                item["revision"] = int(current.get("revision") or 1)
            previous = deepcopy(self._data)
            self._data["programs"][program_id] = item
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                raise

    async def async_stop(self, program_id: str, reason: str) -> None:
        """Permanently stop future course moments while preserving results."""
        normalized_reason = str(reason or "").strip()
        if not normalized_reason:
            raise ValueError("A stop reason is required")
        async with self._lock:
            current = self._data.get("programs", {}).get(program_id)
            if not isinstance(current, dict) or current.get("schedule_type") != "course":
                raise ValueError("Unknown treatment")
            if current.get("stopped_at"):
                raise ValueError("Treatment is already stopped")
            item = normalize_care_program(
                {**current, "enabled": False, "stopped_at": dt_util.now().isoformat(),
                 "stop_reason": normalized_reason},
                program_id=program_id, updated_at=dt_util.now().isoformat(),
            )
            previous = deepcopy(self._data)
            self._data["programs"][program_id] = item
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                raise

    async def async_delete(self, program_id: str) -> None:
        """Delete one age-based care program."""
        async with self._lock:
            if program_id not in self._data.get("programs", {}):
                raise ValueError("Unknown care program")
            previous = deepcopy(self._data)
            del self._data["programs"][program_id]
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                raise
