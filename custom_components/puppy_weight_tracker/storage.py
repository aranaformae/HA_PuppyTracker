"""Persistent storage for Puppy Weight Tracker."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    DEFAULT_GROWTH_MONITORING_DAYS,
    DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
    DEFAULT_MIN_DAILY_GROWTH_PERCENT,
    DEFAULT_NOTIFICATIONS_ENABLED,
    DEFAULT_NOTIFY_RECOVERY,
    DEFAULT_NOTIFY_SESSION_COMPLETE,
    DEFAULT_NOTIFY_ENTITIES,
    STORAGE_KEY,
    STORAGE_VERSION,
)


def _now_iso() -> str:
    """Return current Home Assistant local time as ISO string."""
    return dt_util.now().isoformat()


def _default_settings() -> dict[str, Any]:
    """Return default monitoring settings."""
    return {
        "min_daily_growth_percent": DEFAULT_MIN_DAILY_GROWTH_PERCENT,
        "max_hours_between_weighings": DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
        "growth_monitoring_days": DEFAULT_GROWTH_MONITORING_DAYS,
        "notifications_enabled": DEFAULT_NOTIFICATIONS_ENABLED,
        "notify_recovery": DEFAULT_NOTIFY_RECOVERY,
        "notify_session_complete": DEFAULT_NOTIFY_SESSION_COMPLETE,
        "notify_entities": list(DEFAULT_NOTIFY_ENTITIES),
    }


def _empty_data() -> dict[str, Any]:
    """Return a fresh empty database."""
    now = _now_iso()

    return {
        "schema_version": 4,
        "created_at": now,
        "updated_at": now,
        "settings": _default_settings(),
        "litters": {},
        "audit_log": [],
    }


class PuppyWeightStorage:
    """Handle persistent Puppy Weight Tracker data."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize storage."""
        self.hass = hass

        self._store: Store[dict[str, Any]] = Store(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY,
        )

        self._data: dict[str, Any] = {}
        self._lock = asyncio.Lock()

    async def async_load(self) -> None:
        """Load data from Home Assistant storage and migrate older data."""
        stored = await self._store.async_load()

        if stored is None:
            self._data = _empty_data()
            await self.async_save()
            return

        self._data = stored
        changed = False

        if "schema_version" not in self._data:
            self._data["schema_version"] = 1
            changed = True

        if "created_at" not in self._data:
            self._data["created_at"] = _now_iso()
            changed = True

        if "updated_at" not in self._data:
            self._data["updated_at"] = _now_iso()
            changed = True

        if "litters" not in self._data:
            self._data["litters"] = {}
            changed = True

        if "audit_log" not in self._data:
            self._data["audit_log"] = []
            changed = True

        if "settings" not in self._data:
            self._data["settings"] = {}
            changed = True

        settings = self._data["settings"]
        defaults = _default_settings()

        for key, value in defaults.items():
            if key not in settings:
                settings[key] = value
                changed = True

        if self._migrate_measurements():
            changed = True

        if self._migrate_litter_summaries():
            changed = True

        if self._data.get("schema_version", 1) < 4:
            self._data["schema_version"] = 4
            changed = True

        if changed:
            await self.async_save()

    def _migrate_litter_summaries(self) -> bool:
        """Add persistent litter summary metadata without changing measurements."""

        changed = False

        for litter in self._data.get("litters", {}).values():
            if "last_completed_session" not in litter:
                litter["last_completed_session"] = None
                changed = True

        return changed

    def _migrate_measurements(self) -> bool:
        """Normalize measurement records and synchronize birth measurements."""
        changed = False
        now = _now_iso()

        for litter_id, litter in self._data.get("litters", {}).items():
            if "puppies" not in litter:
                litter["puppies"] = {}
                changed = True

            for puppy_id, puppy in litter.get("puppies", {}).items():
                measurements = puppy.setdefault("measurements", [])

                for measurement in measurements:
                    defaults = {
                        "id": str(uuid4()),
                        "timestamp": measurement.get("created_at") or now,
                        "created_at": now,
                        "updated_at": measurement.get("created_at") or now,
                        "deleted": False,
                        "deleted_at": None,
                        "superseded_by": None,
                        "note": None,
                        "kind": None,
                        "correction_reason": None,
                        "source_measurement_id": None,
                    }
                    for key, value in defaults.items():
                        if key not in measurement:
                            measurement[key] = value
                            changed = True

                # Versions 0.4.0-0.6.0 could leave the predecessor of a
                # deleted correction marked as superseded. Repair those chains
                # before birth-profile synchronization so the previous version
                # of the same measurement becomes active again.
                if self._repair_deleted_correction_chains(puppy):
                    changed = True

                birth_weight = puppy.get("birth_weight")
                birth_time = puppy.get("birth_time")
                birth_measurement = self._find_birth_measurement(puppy)

                # The puppy profile was the editable source in older versions.
                # Keep that latest user intent, but preserve the old measurement
                # by creating a correction instead of overwriting it.
                if birth_weight is None:
                    if birth_measurement is not None and not birth_measurement.get("deleted", False):
                        birth_measurement["deleted"] = True
                        birth_measurement["deleted_at"] = now
                        birth_measurement["updated_at"] = now
                        self._add_audit_entry(
                            action="migration_clear_birth_measurement",
                            litter_id=litter_id,
                            puppy_id=puppy_id,
                            measurement_id=birth_measurement.get("id"),
                            details={"reason": "Birth weight is empty in puppy profile"},
                        )
                        changed = True
                    if puppy.get("birth_measurement_id") is not None:
                        puppy["birth_measurement_id"] = None
                        changed = True
                    continue

                desired_weight = float(birth_weight)

                if birth_measurement is None:
                    matching = self._find_matching_birth_candidate(
                        puppy, desired_weight, birth_time
                    )
                    if matching is not None:
                        matching["kind"] = "birth"
                        birth_measurement = matching
                        changed = True
                    else:
                        measurement_id = str(uuid4())
                        birth_measurement = {
                            "id": measurement_id,
                            "weight": desired_weight,
                            "timestamp": birth_time or puppy.get("created_at") or now,
                            "created_at": now,
                            "updated_at": now,
                            "deleted": False,
                            "deleted_at": None,
                            "superseded_by": None,
                            "note": "Geboortegewicht",
                            "kind": "birth",
                            "correction_reason": None,
                            "source_measurement_id": None,
                        }
                        measurements.append(birth_measurement)
                        self._add_audit_entry(
                            action="migration_create_birth_measurement",
                            litter_id=litter_id,
                            puppy_id=puppy_id,
                            measurement_id=measurement_id,
                            details={
                                "weight": desired_weight,
                                "timestamp": birth_measurement["timestamp"],
                            },
                        )
                        changed = True

                birth_measurement = self._follow_replacement_chain(
                    puppy, birth_measurement
                )
                desired_timestamp = birth_time or birth_measurement.get("timestamp") or now

                if (
                    float(birth_measurement.get("weight", 0)) != desired_weight
                    or birth_measurement.get("timestamp") != desired_timestamp
                    or birth_measurement.get("deleted", False)
                ):
                    if birth_measurement.get("deleted", False):
                        birth_measurement["deleted"] = False
                        birth_measurement["deleted_at"] = None
                    replacement = self._create_replacement_measurement(
                        puppy,
                        birth_measurement,
                        new_weight=desired_weight,
                        new_timestamp=desired_timestamp,
                        reason="Automatische synchronisatie geboortegegevens",
                        now=now,
                    )
                    birth_measurement = replacement
                    self._add_audit_entry(
                        action="migration_sync_birth_measurement",
                        litter_id=litter_id,
                        puppy_id=puppy_id,
                        measurement_id=replacement.get("source_measurement_id"),
                        details={
                            "replacement_measurement_id": replacement["id"],
                            "weight": desired_weight,
                            "timestamp": desired_timestamp,
                        },
                    )
                    changed = True

                if birth_measurement.get("kind") != "birth":
                    birth_measurement["kind"] = "birth"
                    changed = True

                if puppy.get("birth_measurement_id") != birth_measurement.get("id"):
                    puppy["birth_measurement_id"] = birth_measurement.get("id")
                    changed = True

        return changed

    @staticmethod
    def _follow_replacement_chain(
        puppy: dict[str, Any],
        measurement: dict[str, Any],
    ) -> dict[str, Any]:
        """Follow superseded_by links to the newest measurement in the chain."""
        by_id = {
            item.get("id"): item
            for item in puppy.get("measurements", [])
            if item.get("id")
        }
        seen: set[str] = set()
        current = measurement
        while current.get("superseded_by"):
            next_id = current.get("superseded_by")
            if next_id in seen or next_id not in by_id:
                break
            seen.add(next_id)
            current = by_id[next_id]
        return current

    @staticmethod
    def _measurement_by_id(
        puppy: dict[str, Any],
        measurement_id: str | None,
    ) -> dict[str, Any] | None:
        """Return a measurement by id."""
        if not measurement_id:
            return None
        for measurement in puppy.get("measurements", []):
            if measurement.get("id") == measurement_id:
                return measurement
        return None

    @classmethod
    def _repair_deleted_correction_chains(
        cls,
        puppy: dict[str, Any],
    ) -> bool:
        """Reactivate predecessors of deleted terminal corrections.

        A correction forms a chain A -> B -> C. Deleting the current terminal
        correction C must make B effective again. Older releases left
        B.superseded_by pointing at deleted C, which caused the whole corrected
        measurement to disappear and an earlier chronological weighing to become
        current instead.
        """
        changed = False
        for measurement in puppy.get("measurements", []):
            if not measurement.get("deleted", False):
                continue
            source_id = measurement.get("source_measurement_id")
            source = cls._measurement_by_id(puppy, source_id)
            if source is None:
                continue
            if source.get("superseded_by") == measurement.get("id"):
                source["superseded_by"] = None
                changed = True
        return changed

    def _find_birth_measurement(
        self,
        puppy: dict[str, Any],
    ) -> dict[str, Any] | None:
        """Find the current active birth measurement for a puppy."""
        measurements = puppy.get("measurements", [])
        by_id = {
            item.get("id"): item
            for item in measurements
            if item.get("id")
        }

        stored_id = puppy.get("birth_measurement_id")
        if stored_id in by_id:
            stored = self._follow_replacement_chain(puppy, by_id[stored_id])
            if (
                not stored.get("deleted", False)
                and stored.get("superseded_by") is None
            ):
                return stored

        candidates = [
            item
            for item in measurements
            if item.get("kind") == "birth" or item.get("note") == "Geboortegewicht"
        ]
        if not candidates:
            return None

        active = [
            item
            for item in candidates
            if not item.get("deleted", False) and item.get("superseded_by") is None
        ]
        if active:
            active.sort(
                key=lambda item: (
                    item.get("timestamp") or "",
                    item.get("created_at") or "",
                ),
                reverse=True,
            )
            return active[0]

        chosen = candidates[0]
        return self._follow_replacement_chain(puppy, chosen)

    @staticmethod
    def _find_matching_birth_candidate(
        puppy: dict[str, Any],
        birth_weight: float,
        birth_time: str | None,
    ) -> dict[str, Any] | None:
        """Find an existing measurement that exactly matches birth profile data."""
        for measurement in puppy.get("measurements", []):
            if measurement.get("deleted", False) or measurement.get("superseded_by") is not None:
                continue
            try:
                same_weight = float(measurement.get("weight")) == float(birth_weight)
            except (TypeError, ValueError):
                same_weight = False
            same_time = birth_time is None or measurement.get("timestamp") == birth_time
            if same_weight and same_time:
                return measurement
        return None

    @staticmethod
    def _create_replacement_measurement(
        puppy: dict[str, Any],
        original: dict[str, Any],
        *,
        new_weight: float,
        new_timestamp: str,
        reason: str | None,
        now: str,
    ) -> dict[str, Any]:
        """Create a correction record while retaining the original measurement."""
        replacement_id = str(uuid4())
        replacement = {
            "id": replacement_id,
            "weight": float(new_weight),
            "timestamp": new_timestamp,
            "created_at": now,
            "updated_at": now,
            "deleted": False,
            "deleted_at": None,
            "superseded_by": None,
            "note": original.get("note"),
            "kind": original.get("kind"),
            "correction_reason": reason,
            "source_measurement_id": original.get("id"),
        }
        original["superseded_by"] = replacement_id
        original["updated_at"] = now
        puppy.setdefault("measurements", []).append(replacement)
        puppy["updated_at"] = now
        return replacement

    async def async_save(self) -> None:
        """Immediately save data to disk."""
        self._data["updated_at"] = _now_iso()
        await self._store.async_save(self._data)

    def get_data(self) -> dict[str, Any]:
        """Return a safe copy of all data."""
        return deepcopy(self._data)

    def get_settings(self) -> dict[str, Any]:
        """Return monitoring settings."""
        return deepcopy(
            self._data.get(
                "settings",
                _default_settings(),
            )
        )

    def get_litters(self) -> dict[str, Any]:
        """Return all litters."""
        return deepcopy(
            self._data.get(
                "litters",
                {},
            )
        )

    def get_litter(
        self,
        litter_id: str,
    ) -> dict[str, Any] | None:
        """Return one litter."""
        litter = self._data.get(
            "litters",
            {},
        ).get(litter_id)

        if litter is None:
            return None

        return deepcopy(litter)

    def get_puppy(
        self,
        litter_id: str,
        puppy_id: str,
    ) -> dict[str, Any] | None:
        """Return one puppy."""
        litter = self._data.get(
            "litters",
            {},
        ).get(litter_id)

        if litter is None:
            return None

        puppy = litter.get(
            "puppies",
            {},
        ).get(puppy_id)

        if puppy is None:
            return None

        return deepcopy(puppy)

    async def async_update_settings(
        self,
        *,
        min_daily_growth_percent: float,
        max_hours_between_weighings: float,
        growth_monitoring_days: int,
        notifications_enabled: bool,
        notify_recovery: bool,
        notify_session_complete: bool,
        notify_entities: list[str] | None = None,
    ) -> None:
        """Update monitoring settings."""

        min_growth = float(
            min_daily_growth_percent
        )
        max_hours = float(
            max_hours_between_weighings
        )
        monitoring_days = int(
            growth_monitoring_days
        )

        if not 0 <= min_growth <= 20:
            raise ValueError(
                "Minimum daily growth must be between 0 and 20 percent"
            )

        if not 1 <= max_hours <= 168:
            raise ValueError(
                "Maximum weighing interval must be between 1 and 168 hours"
            )

        if not 1 <= monitoring_days <= 56:
            raise ValueError(
                "Growth monitoring period must be between 1 and 56 days"
            )

        async with self._lock:
            before = deepcopy(
                self._data.get(
                    "settings",
                    {},
                )
            )

            settings = {
                "min_daily_growth_percent": min_growth,
                "max_hours_between_weighings": max_hours,
                "growth_monitoring_days": monitoring_days,
                "notifications_enabled": bool(notifications_enabled),
                "notify_recovery": bool(notify_recovery),
                "notify_session_complete": bool(notify_session_complete),
                "notify_entities": [
                    str(entity_id)
                    for entity_id in (notify_entities or [])
                    if str(entity_id).startswith("notify.")
                ],
            }

            self._data["settings"] = settings

            self._add_audit_entry(
                action="update_settings",
                details={
                    "before": before,
                    "after": deepcopy(settings),
                },
            )

            await self.async_save()

    async def async_create_litter(
        self,
        name: str,
        birth_date: str | None = None,
        mother: str | None = None,
        father: str | None = None,
    ) -> str:
        """Create a new litter."""

        async with self._lock:
            litter_id = str(uuid4())
            now = _now_iso()

            self._data["litters"][litter_id] = {
                "id": litter_id,
                "name": name,
                "birth_date": birth_date,
                "mother": mother,
                "father": father,
                "active": True,
                "created_at": now,
                "updated_at": now,
                "puppies": {},
                "last_completed_session": None,
            }

            self._add_audit_entry(
                action="create_litter",
                litter_id=litter_id,
                details={
                    "name": name,
                    "birth_date": birth_date,
                    "mother": mother,
                    "father": father,
                },
            )

            await self.async_save()

            return litter_id

    async def async_update_litter(
        self,
        litter_id: str,
        *,
        name: str,
        birth_date: str | None,
        mother: str | None,
        father: str | None,
    ) -> None:
        """Update litter details."""

        async with self._lock:
            litter = self._require_litter(
                litter_id
            )

            before = {
                "name": litter.get("name"),
                "birth_date": litter.get("birth_date"),
                "mother": litter.get("mother"),
                "father": litter.get("father"),
                "active": litter.get("active", True),
            }

            now = _now_iso()

            litter["name"] = name
            litter["birth_date"] = birth_date
            litter["mother"] = mother
            litter["father"] = father
            litter["updated_at"] = now

            self._add_audit_entry(
                action="update_litter",
                litter_id=litter_id,
                details={
                    "before": before,
                    "after": {
                        "name": name,
                        "birth_date": birth_date,
                        "mother": mother,
                        "father": father,
                        "active": litter.get(
                            "active",
                            True,
                        ),
                    },
                },
            )

            await self.async_save()

    async def async_set_litter_active(
        self,
        litter_id: str,
        active: bool,
    ) -> None:
        """Archive or restore a litter."""

        async with self._lock:
            litter = self._require_litter(
                litter_id
            )

            litter["active"] = bool(active)
            litter["updated_at"] = _now_iso()

            self._add_audit_entry(
                action=(
                    "restore_litter"
                    if active
                    else "archive_litter"
                ),
                litter_id=litter_id,
            )

            await self.async_save()

    async def async_delete_litter(
        self,
        litter_id: str,
    ) -> dict[str, Any]:
        """Permanently delete a litter."""

        async with self._lock:
            litter = self._require_litter(
                litter_id
            )

            removed = deepcopy(litter)

            puppy_count = len(
                litter.get(
                    "puppies",
                    {},
                )
            )

            measurement_count = sum(
                len(
                    puppy.get(
                        "measurements",
                        [],
                    )
                )
                for puppy in litter.get(
                    "puppies",
                    {},
                ).values()
            )

            self._add_audit_entry(
                action="delete_litter",
                litter_id=litter_id,
                details={
                    "name": litter.get("name"),
                    "puppy_count": puppy_count,
                    "measurement_count": measurement_count,
                },
            )

            del self._data["litters"][
                litter_id
            ]

            await self.async_save()

            return removed

    async def async_add_puppy(
        self,
        litter_id: str,
        name: str,
        birth_weight: float | None = None,
        birth_time: str | None = None,
        collar_color: str | None = None,
        sex: str | None = None,
        notes: str | None = None,
    ) -> str:
        """Add a puppy to a litter."""

        async with self._lock:
            litter = self._require_litter(
                litter_id
            )

            puppy_id = str(uuid4())
            now = _now_iso()

            puppy = {
                "id": puppy_id,
                "name": name,
                "collar_color": collar_color,
                "sex": sex,
                "birth_weight": (
                    float(birth_weight)
                    if birth_weight is not None
                    else None
                ),
                "birth_time": birth_time,
                "birth_measurement_id": None,
                "notes": notes,
                "active": True,
                "created_at": now,
                "updated_at": now,
                "measurements": [],
            }

            litter["puppies"][
                puppy_id
            ] = puppy

            litter["updated_at"] = now

            self._add_audit_entry(
                action="add_puppy",
                litter_id=litter_id,
                puppy_id=puppy_id,
                details={
                    "name": name,
                    "birth_weight": birth_weight,
                    "birth_time": birth_time,
                    "collar_color": collar_color,
                    "sex": sex,
                },
            )

            if birth_weight is not None:
                measurement_id = str(
                    uuid4()
                )

                puppy[
                    "measurements"
                ].append(
                    {
                        "id": measurement_id,
                        "weight": float(
                            birth_weight
                        ),
                        "timestamp": (
                            birth_time
                            or now
                        ),
                        "created_at": now,
                        "updated_at": now,
                        "deleted": False,
                        "deleted_at": None,
                        "superseded_by": None,
                        "note": "Geboortegewicht",
                        "kind": "birth",
                        "correction_reason": None,
                        "source_measurement_id": None,
                    }
                )
                puppy["birth_measurement_id"] = measurement_id

            await self.async_save()

            return puppy_id

    async def async_update_puppy(
        self,
        litter_id: str,
        puppy_id: str,
        *,
        name: str,
        collar_color: str | None,
        sex: str | None,
        birth_weight: float | None,
        birth_time: str | None,
        notes: str | None,
    ) -> None:
        """Update puppy details and keep the birth measurement synchronized."""

        async with self._lock:
            puppy = self._require_puppy(litter_id, puppy_id)

            before = {
                "name": puppy.get("name"),
                "collar_color": puppy.get("collar_color"),
                "sex": puppy.get("sex"),
                "birth_weight": puppy.get("birth_weight"),
                "birth_time": puppy.get("birth_time"),
                "notes": puppy.get("notes"),
                "active": puppy.get("active", True),
            }

            now = _now_iso()
            new_birth_weight = float(birth_weight) if birth_weight is not None else None

            puppy["name"] = name
            puppy["collar_color"] = collar_color
            puppy["sex"] = sex
            puppy["birth_weight"] = new_birth_weight
            puppy["birth_time"] = birth_time
            puppy["notes"] = notes
            puppy["updated_at"] = now

            birth_measurement = self._find_birth_measurement(puppy)

            if new_birth_weight is None:
                if birth_measurement is not None and not birth_measurement.get("deleted", False):
                    birth_measurement["deleted"] = True
                    birth_measurement["deleted_at"] = now
                    birth_measurement["updated_at"] = now
                    self._add_audit_entry(
                        action="delete_birth_weight",
                        litter_id=litter_id,
                        puppy_id=puppy_id,
                        measurement_id=birth_measurement.get("id"),
                        details={
                            "weight": birth_measurement.get("weight"),
                            "timestamp": birth_measurement.get("timestamp"),
                            "reason": "Geboortegewicht verwijderd via puppygegevens",
                        },
                    )
                puppy["birth_measurement_id"] = None
            else:
                desired_timestamp = birth_time or (
                    birth_measurement.get("timestamp") if birth_measurement is not None else now
                )

                if birth_measurement is None or birth_measurement.get("deleted", False):
                    measurement_id = str(uuid4())
                    new_measurement = {
                        "id": measurement_id,
                        "weight": new_birth_weight,
                        "timestamp": desired_timestamp,
                        "created_at": now,
                        "updated_at": now,
                        "deleted": False,
                        "deleted_at": None,
                        "superseded_by": None,
                        "note": "Geboortegewicht",
                        "kind": "birth",
                        "correction_reason": None,
                        "source_measurement_id": None,
                    }
                    puppy.setdefault("measurements", []).append(new_measurement)
                    puppy["birth_measurement_id"] = measurement_id
                    self._add_audit_entry(
                        action="create_birth_weight",
                        litter_id=litter_id,
                        puppy_id=puppy_id,
                        measurement_id=measurement_id,
                        details={
                            "weight": new_birth_weight,
                            "timestamp": desired_timestamp,
                        },
                    )
                elif (
                    float(birth_measurement.get("weight", 0)) != new_birth_weight
                    or birth_measurement.get("timestamp") != desired_timestamp
                ):
                    replacement = self._create_replacement_measurement(
                        puppy,
                        birth_measurement,
                        new_weight=new_birth_weight,
                        new_timestamp=desired_timestamp,
                        reason="Geboortegegevens aangepast via puppybeheer",
                        now=now,
                    )
                    replacement["kind"] = "birth"
                    replacement["note"] = "Geboortegewicht"
                    puppy["birth_measurement_id"] = replacement["id"]
                    self._add_audit_entry(
                        action="correct_birth_weight",
                        litter_id=litter_id,
                        puppy_id=puppy_id,
                        measurement_id=birth_measurement.get("id"),
                        details={
                            "old_weight": birth_measurement.get("weight"),
                            "new_weight": new_birth_weight,
                            "old_timestamp": birth_measurement.get("timestamp"),
                            "new_timestamp": desired_timestamp,
                            "replacement_measurement_id": replacement["id"],
                        },
                    )
                else:
                    birth_measurement["kind"] = "birth"
                    birth_measurement["note"] = "Geboortegewicht"
                    puppy["birth_measurement_id"] = birth_measurement.get("id")

            self._data["litters"][litter_id]["updated_at"] = now

            self._add_audit_entry(
                action="update_puppy",
                litter_id=litter_id,
                puppy_id=puppy_id,
                details={
                    "before": before,
                    "after": {
                        "name": name,
                        "collar_color": collar_color,
                        "sex": sex,
                        "birth_weight": new_birth_weight,
                        "birth_time": birth_time,
                        "notes": notes,
                        "active": puppy.get("active", True),
                    },
                },
            )

            await self.async_save()

    async def async_set_puppy_active(
        self,
        litter_id: str,
        puppy_id: str,
        active: bool,
    ) -> None:
        """Archive or restore a puppy."""

        async with self._lock:
            puppy = self._require_puppy(
                litter_id,
                puppy_id,
            )

            puppy["active"] = bool(active)
            puppy["updated_at"] = _now_iso()

            self._add_audit_entry(
                action=(
                    "restore_puppy"
                    if active
                    else "archive_puppy"
                ),
                litter_id=litter_id,
                puppy_id=puppy_id,
            )

            await self.async_save()

    async def async_delete_puppy(
        self,
        litter_id: str,
        puppy_id: str,
    ) -> dict[str, Any]:
        """Permanently delete a puppy."""

        async with self._lock:
            litter = self._require_litter(
                litter_id
            )

            puppy = self._require_puppy(
                litter_id,
                puppy_id,
            )

            removed = deepcopy(puppy)

            self._add_audit_entry(
                action="delete_puppy",
                litter_id=litter_id,
                puppy_id=puppy_id,
                details={
                    "name": puppy.get("name"),
                    "measurement_count": len(
                        puppy.get(
                            "measurements",
                            [],
                        )
                    ),
                },
            )

            del litter["puppies"][
                puppy_id
            ]

            litter["updated_at"] = _now_iso()

            await self.async_save()

            return removed

    async def async_record_completed_weighing_session(
        self,
        litter_id: str,
        session: dict[str, Any],
    ) -> None:
        """Persist metadata for a fully completed weighing session."""

        completed_at = session.get("completed_at")
        if not completed_at:
            return

        async with self._lock:
            litter = self._require_litter(litter_id)

            existing = litter.get("last_completed_session")
            if (
                isinstance(existing, dict)
                and existing.get("completed_at") == completed_at
            ):
                return

            puppy_ids = list(session.get("puppy_ids", []))
            weighed_ids = list(session.get("weighed_puppy_ids", []))

            summary = {
                "started_at": session.get("started_at"),
                "completed_at": completed_at,
                "puppy_ids": puppy_ids,
                "weighed_puppy_ids": weighed_ids,
                "total_puppies": len(puppy_ids),
                "weighed_puppies": len(weighed_ids),
            }

            litter["last_completed_session"] = summary
            litter["updated_at"] = _now_iso()

            self._add_audit_entry(
                action="complete_weighing_session",
                litter_id=litter_id,
                details=deepcopy(summary),
            )

            await self.async_save()

    async def async_record_weight(
        self,
        litter_id: str,
        puppy_id: str,
        weight: float,
        timestamp: str | None = None,
        note: str | None = None,
    ) -> str:
        """Record a new puppy weight."""

        if weight <= 0:
            raise ValueError(
                "Weight must be greater than zero"
            )

        async with self._lock:
            puppy = self._require_puppy(
                litter_id,
                puppy_id,
            )

            measurement_id = str(
                uuid4()
            )

            now = _now_iso()

            measurement = {
                "id": measurement_id,
                "weight": float(weight),
                "timestamp": timestamp or now,
                "created_at": now,
                "updated_at": now,
                "deleted": False,
                "deleted_at": None,
                "superseded_by": None,
                "note": note,
                "kind": "weight",
                "correction_reason": None,
                "source_measurement_id": None,
            }

            puppy[
                "measurements"
            ].append(
                measurement
            )

            puppy["updated_at"] = now

            self._data["litters"][
                litter_id
            ]["updated_at"] = now

            self._add_audit_entry(
                action="record_weight",
                litter_id=litter_id,
                puppy_id=puppy_id,
                measurement_id=measurement_id,
                details={
                    "weight": float(weight),
                    "timestamp": measurement[
                        "timestamp"
                    ],
                    "note": note,
                },
            )

            await self.async_save()

            return measurement_id

    async def async_correct_measurement(
        self,
        litter_id: str,
        puppy_id: str,
        measurement_id: str,
        *,
        new_weight: float,
        new_timestamp: str,
        reason: str | None = None,
    ) -> str:
        """Correct weight and/or timestamp without destroying the original."""
        if new_weight <= 0:
            raise ValueError("Weight must be greater than zero")
        if not new_timestamp:
            raise ValueError("Timestamp is required")

        async with self._lock:
            puppy = self._require_puppy(litter_id, puppy_id)
            original = self._require_measurement(puppy, measurement_id)

            if original.get("deleted"):
                raise ValueError("Cannot correct a deleted measurement")
            if original.get("superseded_by") is not None:
                raise ValueError("Cannot correct a superseded measurement")

            now = _now_iso()
            replacement = self._create_replacement_measurement(
                puppy,
                original,
                new_weight=float(new_weight),
                new_timestamp=new_timestamp,
                reason=reason or "Correctie",
                now=now,
            )

            if original.get("kind") == "birth":
                replacement["kind"] = "birth"
                replacement["note"] = "Geboortegewicht"
                puppy["birth_measurement_id"] = replacement["id"]
                puppy["birth_weight"] = float(new_weight)
                puppy["birth_time"] = new_timestamp

            self._data["litters"][litter_id]["updated_at"] = now

            self._add_audit_entry(
                action="correct_measurement",
                litter_id=litter_id,
                puppy_id=puppy_id,
                measurement_id=measurement_id,
                details={
                    "old_weight": original.get("weight"),
                    "new_weight": float(new_weight),
                    "old_timestamp": original.get("timestamp"),
                    "new_timestamp": new_timestamp,
                    "replacement_measurement_id": replacement["id"],
                    "reason": reason,
                    "kind": original.get("kind"),
                },
            )

            await self.async_save()
            return replacement["id"]

    async def async_correct_weight(
        self,
        litter_id: str,
        puppy_id: str,
        measurement_id: str,
        new_weight: float,
        reason: str | None = None,
    ) -> str:
        """Backward-compatible helper for weight-only correction."""
        puppy = self._require_puppy(litter_id, puppy_id)
        original = self._require_measurement(puppy, measurement_id)
        return await self.async_correct_measurement(
            litter_id,
            puppy_id,
            measurement_id,
            new_weight=new_weight,
            new_timestamp=original.get("timestamp") or _now_iso(),
            reason=reason,
        )

    async def async_delete_weight(
        self,
        litter_id: str,
        puppy_id: str,
        measurement_id: str,
        reason: str | None = None,
    ) -> None:
        """Soft-delete a current measurement and reactivate its predecessor."""
        async with self._lock:
            puppy = self._require_puppy(litter_id, puppy_id)
            measurement = self._require_measurement(puppy, measurement_id)

            if measurement.get("deleted", False):
                raise ValueError("Measurement is already deleted")
            if measurement.get("superseded_by") is not None:
                raise ValueError("Cannot delete a superseded measurement")

            now = _now_iso()
            source = self._measurement_by_id(
                puppy,
                measurement.get("source_measurement_id"),
            )
            reactivated_measurement_id: str | None = None

            # If this is a correction, deleting it behaves like an undo:
            # reactivate the immediately preceding version of the same
            # measurement instead of falling back to an unrelated older weighing.
            if (
                source is not None
                and source.get("superseded_by") == measurement_id
            ):
                source["superseded_by"] = None
                source["updated_at"] = now
                reactivated_measurement_id = source.get("id")

            measurement["deleted"] = True
            measurement["deleted_at"] = now
            measurement["updated_at"] = now
            puppy["updated_at"] = now
            self._data["litters"][litter_id]["updated_at"] = now

            if measurement.get("kind") == "birth":
                if (
                    source is not None
                    and not source.get("deleted", False)
                    and source.get("superseded_by") is None
                    and source.get("kind") == "birth"
                ):
                    puppy["birth_weight"] = float(source["weight"])
                    puppy["birth_time"] = source.get("timestamp")
                    puppy["birth_measurement_id"] = source.get("id")
                else:
                    puppy["birth_weight"] = None
                    puppy["birth_measurement_id"] = None

            self._add_audit_entry(
                action="delete_weight",
                litter_id=litter_id,
                puppy_id=puppy_id,
                measurement_id=measurement_id,
                details={
                    "weight": measurement.get("weight"),
                    "timestamp": measurement.get("timestamp"),
                    "reason": reason,
                    "kind": measurement.get("kind"),
                    "reactivated_measurement_id": reactivated_measurement_id,
                },
            )

            await self.async_save()

    async def async_restore_weight(
        self,
        litter_id: str,
        puppy_id: str,
        measurement_id: str,
        reason: str | None = None,
    ) -> None:
        """Restore a soft-deleted measurement and reapply its correction chain."""
        async with self._lock:
            puppy = self._require_puppy(litter_id, puppy_id)
            measurement = self._require_measurement(puppy, measurement_id)

            if not measurement.get("deleted", False):
                raise ValueError("Measurement is not deleted")
            if measurement.get("superseded_by") is not None:
                raise ValueError("Cannot restore a superseded measurement")

            now = _now_iso()
            source = self._measurement_by_id(
                puppy,
                measurement.get("source_measurement_id"),
            )

            if source is not None:
                if source.get("deleted", False):
                    raise ValueError(
                        "Cannot restore correction while its previous version is deleted"
                    )
                current_successor = source.get("superseded_by")
                if current_successor not in (None, measurement_id):
                    raise ValueError(
                        "Cannot restore correction because a newer correction is active"
                    )
                source["superseded_by"] = measurement_id
                source["updated_at"] = now

            measurement["deleted"] = False
            measurement["deleted_at"] = None
            measurement["updated_at"] = now
            puppy["updated_at"] = now
            self._data["litters"][litter_id]["updated_at"] = now

            if measurement.get("kind") == "birth":
                puppy["birth_weight"] = float(measurement["weight"])
                puppy["birth_time"] = measurement.get("timestamp")
                puppy["birth_measurement_id"] = measurement.get("id")

            self._add_audit_entry(
                action="restore_weight",
                litter_id=litter_id,
                puppy_id=puppy_id,
                measurement_id=measurement_id,
                details={
                    "weight": measurement.get("weight"),
                    "timestamp": measurement.get("timestamp"),
                    "reason": reason,
                    "kind": measurement.get("kind"),
                    "supersedes_measurement_id": (
                        source.get("id") if source is not None else None
                    ),
                },
            )

            await self.async_save()

    def get_measurement(
        self,
        litter_id: str,
        puppy_id: str,
        measurement_id: str,
    ) -> dict[str, Any] | None:
        """Return one measurement."""
        puppy = self.get_puppy(litter_id, puppy_id)
        if puppy is None:
            return None
        for measurement in puppy.get("measurements", []):
            if measurement.get("id") == measurement_id:
                return deepcopy(measurement)
        return None

    def get_measurements(
        self,
        litter_id: str,
        puppy_id: str,
        *,
        include_inactive: bool = True,
    ) -> list[dict[str, Any]]:
        """Return measurements sorted from newest to oldest."""
        puppy = self._require_puppy(litter_id, puppy_id)
        measurements = list(puppy.get("measurements", []))
        if not include_inactive:
            measurements = [
                item
                for item in measurements
                if not item.get("deleted", False) and item.get("superseded_by") is None
            ]
        measurements.sort(
            key=lambda item: (
                item.get("timestamp") or "",
                item.get("created_at") or "",
            ),
            reverse=True,
        )
        return deepcopy(measurements)

    def get_active_measurements(
        self,
        litter_id: str,
        puppy_id: str,
    ) -> list[dict[str, Any]]:
        """Return currently valid measurements."""
        puppy = self._require_puppy(litter_id, puppy_id)
        measurements = [
            measurement
            for measurement in puppy.get("measurements", [])
            if not measurement.get("deleted", False)
            and measurement.get("superseded_by") is None
        ]
        return deepcopy(measurements)

    def _require_litter(
        self,
        litter_id: str,
    ) -> dict[str, Any]:
        """Return litter or raise."""

        litter = self._data.get(
            "litters",
            {},
        ).get(
            litter_id
        )

        if litter is None:
            raise ValueError(
                f"Unknown litter: {litter_id}"
            )

        return litter

    def _require_puppy(
        self,
        litter_id: str,
        puppy_id: str,
    ) -> dict[str, Any]:
        """Return puppy or raise."""

        litter = self._require_litter(
            litter_id
        )

        puppy = litter.get(
            "puppies",
            {},
        ).get(
            puppy_id
        )

        if puppy is None:
            raise ValueError(
                f"Unknown puppy: {puppy_id}"
            )

        return puppy

    @staticmethod
    def _require_measurement(
        puppy: dict[str, Any],
        measurement_id: str,
    ) -> dict[str, Any]:
        """Return measurement or raise."""

        for measurement in puppy.get(
            "measurements",
            [],
        ):
            if (
                measurement.get("id")
                == measurement_id
            ):
                return measurement

        raise ValueError(
            f"Unknown measurement: {measurement_id}"
        )

    def _add_audit_entry(
        self,
        action: str,
        litter_id: str | None = None,
        puppy_id: str | None = None,
        measurement_id: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        """Add audit log entry."""

        self._data[
            "audit_log"
        ].append(
            {
                "id": str(uuid4()),
                "timestamp": _now_iso(),
                "action": action,
                "litter_id": litter_id,
                "puppy_id": puppy_id,
                "measurement_id": measurement_id,
                "details": details or {},
            }
        )