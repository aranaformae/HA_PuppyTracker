"""Age-based care program model for litter puppy care."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN

STORE_KEY = f"{DOMAIN}_care_programs"
STORE_VERSION = 1
SCHEDULE_TYPES = {"once", "range"}
RESULT_FIELDS = {"result", "score", "note"}
DEFAULT_RESULT_FIELDS = ["result", "note"]
MAX_AGE_DAYS = 3650


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


def normalize_care_program(
    data: dict[str, Any], *, program_id: str | None = None
) -> dict[str, Any]:
    """Validate and normalize one age-based care program."""
    litter_id = str(data.get("litter_id") or "").strip()
    if not litter_id:
        raise ValueError("litter_id is required")

    title = str(data.get("title") or "").strip()
    if not title:
        raise ValueError("title is required")

    schedule_type = str(data.get("schedule_type") or "").strip()
    if schedule_type not in SCHEDULE_TYPES:
        raise ValueError("schedule_type must be once or range")

    start_age_days = _normalize_age(data.get("start_age_days"), field="start_age_days")
    end_age_days = start_age_days
    interval_days: int | None = None

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
    record_type = str(data.get("record_type") or "note").strip() or "note"
    time_of_day = _normalize_time_of_day(data.get("time_of_day"))
    result_fields = _normalize_result_fields(data.get("result_fields"))
    now = dt_util.now().isoformat()

    return {
        "id": program_id or str(data.get("id") or uuid4()),
        "litter_id": litter_id,
        "enabled": bool(data.get("enabled", True)),
        "title": title,
        "description": description,
        "record_type": record_type,
        "schedule_type": schedule_type,
        "start_age_days": start_age_days,
        "end_age_days": end_age_days,
        "interval_days": interval_days,
        "time_of_day": time_of_day,
        "notifications_enabled": bool(data.get("notifications_enabled", True)),
        "result_fields": result_fields,
        "created_at": str(data.get("created_at") or now),
        "updated_at": now,
    }


class AgeBasedCareProgramStore:
    """Persistent storage for litter-specific age-based care programs."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self._data: dict[str, Any] = {"programs": {}}
        self._lock = asyncio.Lock()

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        programs = loaded.get("programs", {}) if isinstance(loaded, dict) else {}
        normalized: dict[str, dict[str, Any]] = {}
        if isinstance(programs, dict):
            for key, value in programs.items():
                if not isinstance(value, dict):
                    continue
                try:
                    item = normalize_care_program(value, program_id=str(key))
                except ValueError:
                    continue
                normalized[item["id"]] = item
        self._data = {"programs": normalized}
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

    async def async_create(self, data: dict[str, Any]) -> str:
        """Create one age-based care program."""
        item = normalize_care_program(data)
        async with self._lock:
            self._data.setdefault("programs", {})[item["id"]] = item
            await self._store.async_save(self._data)
        return item["id"]

    async def async_update(self, program_id: str, data: dict[str, Any]) -> None:
        """Update one age-based care program."""
        current = self.get_program(program_id)
        if current is None:
            raise ValueError("Unknown care program")
        item = normalize_care_program(
            {**current, **deepcopy(data)}, program_id=program_id
        )
        async with self._lock:
            self._data["programs"][program_id] = item
            await self._store.async_save(self._data)

    async def async_delete(self, program_id: str) -> None:
        """Delete one age-based care program."""
        async with self._lock:
            if program_id not in self._data.get("programs", {}):
                raise ValueError("Unknown care program")
            del self._data["programs"][program_id]
            await self._store.async_save(self._data)
