"""Persistent storage for Puppy Tracker."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from .integrity import inspect_and_repair_data
from .measurements import is_active_measurement, sorted_measurements
from .records import (
    create_record,
    normalize_record,
    sorted_records,
    validate_record_type,
)
from .time_utils import normalize_timestamp

from .const import (
    DEFAULT_DOUBLE_WEIGHT_REFERENCE_DAYS,
    DEFAULT_GROWTH_MONITORING_DAYS,
    DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
    DEFAULT_MIN_DAILY_GROWTH_PERCENT,
    DEFAULT_NOTIFICATIONS_ENABLED,
    DEFAULT_NOTIFICATION_LEAD_MINUTES,
    DEFAULT_NOTIFY_RECOVERY,
    DEFAULT_NOTIFY_SESSION_COMPLETE,
    DEFAULT_NOTIFY_ENTITIES,
    DEFAULT_RECURRING_REMINDER_NOTIFICATIONS_ENABLED,
    DEFAULT_LITTER_GROWTH_ANALYSIS,
    DEFAULT_GROWTH_MILESTONES_PERCENT,
    STORAGE_KEY,
    STORAGE_VERSION,
)


def _now_iso() -> str:
    """Return current time as a timezone-aware UTC ISO string."""
    return datetime.now(timezone.utc).isoformat()


def _default_settings() -> dict[str, Any]:
    """Return default monitoring settings."""
    return {
        "min_daily_growth_percent": DEFAULT_MIN_DAILY_GROWTH_PERCENT,
        "max_hours_between_weighings": DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS,
        "growth_monitoring_days": DEFAULT_GROWTH_MONITORING_DAYS,
        "notifications_enabled": DEFAULT_NOTIFICATIONS_ENABLED,
        "recurring_reminder_notifications_enabled": DEFAULT_RECURRING_REMINDER_NOTIFICATIONS_ENABLED,
        "notify_recovery": DEFAULT_NOTIFY_RECOVERY,
        "notify_session_complete": DEFAULT_NOTIFY_SESSION_COMPLETE,
        "notify_entities": list(DEFAULT_NOTIFY_ENTITIES),
        "notification_lead_minutes": DEFAULT_NOTIFICATION_LEAD_MINUTES,
    }


def _empty_data() -> dict[str, Any]:
    """Return a fresh empty database."""
    now = _now_iso()

    return {
        "schema_version": 7,
        "created_at": now,
        "updated_at": now,
        "settings": _default_settings(),
        "litters": {},
        "audit_log": [],
    }


def _normalize_litter_growth_analysis(value: Any) -> dict[str, Any]:
    """Return a safe per-litter growth-analysis override mapping."""
    raw = value if isinstance(value, dict) else {}
    result = deepcopy(DEFAULT_LITTER_GROWTH_ANALYSIS)
    result["breed_profile"] = str(raw.get("breed_profile") or "unknown").strip() or "unknown"
    result["size_class"] = str(raw.get("size_class") or "unknown").strip() or "unknown"
    raw_milestones = raw.get("growth_milestones_percent")
    if raw_milestones in (None, ""):
        result["growth_milestones_percent"] = list(DEFAULT_GROWTH_MILESTONES_PERCENT)
    else:
        values = raw_milestones.split(",") if isinstance(raw_milestones, str) else raw_milestones
        if not isinstance(values, (list, tuple)):
            raise ValueError("Invalid litter growth setting: growth_milestones_percent")
        try:
            milestones = sorted({int(float(value)) for value in values if str(value).strip()})
        except (TypeError, ValueError) as err:
            raise ValueError("Invalid litter growth setting: growth_milestones_percent") from err
        if not milestones or any(value < 100 or value > 10000 for value in milestones):
            raise ValueError("Invalid litter growth setting: growth_milestones_percent")
    result["growth_milestones_percent"] = milestones
    raw_reference_days = raw.get("double_weight_reference_days")
    if raw_reference_days in (None, ""):
        result["double_weight_reference_days"] = DEFAULT_DOUBLE_WEIGHT_REFERENCE_DAYS
    else:
        try:
            reference_days = int(float(raw_reference_days))
        except (TypeError, ValueError) as err:
            raise ValueError("Invalid litter growth setting: double_weight_reference_days") from err
        if not 1 <= reference_days <= 56:
            raise ValueError("Invalid litter growth setting: double_weight_reference_days")
        result["double_weight_reference_days"] = reference_days

    ranges = {
        "min_daily_growth_percent": (0.0, 20.0),
        "max_hours_between_weighings": (1.0, 168.0),
        "growth_monitoring_days": (1.0, 56.0),
        "first_day_max_weight_loss_percent": (0.0, 50.0),
        "expected_adult_weight_min_grams": (1.0, 100000.0),
        "expected_adult_weight_max_grams": (1.0, 100000.0),
    }
    for key, (minimum, maximum) in ranges.items():
        raw_value = raw.get(key)
        if raw_value in (None, ""):
            result[key] = None
            continue
        try:
            number = float(raw_value)
        except (TypeError, ValueError) as err:
            raise ValueError(f"Invalid litter growth setting: {key}") from err
        if not minimum <= number <= maximum:
            raise ValueError(f"Invalid litter growth setting: {key}")
        result[key] = int(number) if key.endswith(("days", "grams")) else number

    minimum_weight = result["expected_adult_weight_min_grams"]
    maximum_weight = result["expected_adult_weight_max_grams"]
    if minimum_weight is not None and maximum_weight is not None and minimum_weight > maximum_weight:
        raise ValueError("Expected adult minimum weight cannot exceed maximum weight")
    return result


class PuppyTrackerStorage:
    """Handle persistent Puppy Tracker data."""

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
        self._last_integrity_report: dict[str, Any] = {
            "healthy": True,
            "issues_found": 0,
            "repairs_applied": 0,
            "unresolved_count": 0,
            "unresolved_critical": 0,
            "unresolved_warnings": 0,
            "checked": {
                "litters": 0,
                "puppies": 0,
                "measurement_versions": 0,
                "records": 0,
            },
            "issue_counts": {},
            "repair_counts": {},
            "unresolved": [],
        }

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

        for litter in self._data.get("litters", {}).values():
            if isinstance(litter, dict) and "growth_analysis" not in litter:
                litter["growth_analysis"] = deepcopy(DEFAULT_LITTER_GROWTH_ANALYSIS)
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

        if self._migrate_records():
            changed = True

        if self._migrate_metadata_timestamps():
            changed = True

        integrity_changed, integrity_report = inspect_and_repair_data(
            self._data,
            repair=True,
        )
        self._last_integrity_report = integrity_report
        if integrity_changed:
            changed = True
            self._add_audit_entry(
                action="integrity_repair",
                details={
                    "issues_found": integrity_report.get("issues_found", 0),
                    "repairs_applied": integrity_report.get("repairs_applied", 0),
                    "unresolved_critical": integrity_report.get("unresolved_critical", 0),
                    "repair_counts": integrity_report.get("repair_counts", {}),
                },
            )

        if self._data.get("schema_version", 1) < 7:
            self._data["schema_version"] = 7
            changed = True

        if changed:
            await self.async_save()

        # Keep the startup repair report available for setup logging and
        # diagnostics even though async_save refreshes the current clean state.
        if integrity_changed:
            self._last_integrity_report = integrity_report

    def _migrate_litter_summaries(self) -> bool:
        """Add persistent litter summary metadata without changing measurements."""

        changed = False

        for litter in self._data.get("litters", {}).values():
            if "last_completed_session" not in litter:
                litter["last_completed_session"] = None
                changed = True

        return changed

    def _migrate_records(self) -> bool:
        """Prepare litter and puppy dossier containers and profile notes."""
        changed = False
        now = _now_iso()

        for litter_id, litter in self._data.get("litters", {}).items():
            if "records" not in litter:
                litter["records"] = []
                changed = True
            litter_records = litter.get("records")
            if not isinstance(litter_records, list):
                # Leave invalid containers untouched for the integrity checker.
                litter_records = []
            else:
                for record in litter_records:
                    if isinstance(record, dict) and normalize_record(
                        record,
                        litter_id=str(litter_id),
                        puppy_id=None,
                        now=now,
                    ):
                        changed = True

            for puppy_id, puppy in litter.get("puppies", {}).items():
                # ``notes`` was the original free-form puppy profile field.
                # From schema 7 onward it has an explicit meaning as a profile
                # summary; chronological notes belong in ``records``.
                if "profile_note" not in puppy:
                    puppy["profile_note"] = puppy.get("notes")
                    changed = True
                if "notes" in puppy:
                    del puppy["notes"]
                    changed = True

                if "records" not in puppy:
                    puppy["records"] = []
                    changed = True
                puppy_records = puppy.get("records")
                if not isinstance(puppy_records, list):
                    continue

                for record in puppy_records:
                    if isinstance(record, dict) and normalize_record(
                        record,
                        litter_id=str(litter_id),
                        puppy_id=str(puppy_id),
                        now=now,
                    ):
                        changed = True

        return changed

    def _migrate_metadata_timestamps(self) -> bool:
        """Normalize storage and audit metadata timestamps to UTC."""
        changed = False

        for field in ("created_at", "updated_at"):
            raw_value = self._data.get(field)
            if raw_value:
                normalized_value = normalize_timestamp(raw_value)
                if normalized_value and normalized_value != raw_value:
                    self._data[field] = normalized_value
                    changed = True

        for entry in self._data.get("audit_log", []):
            if not isinstance(entry, dict):
                continue
            raw_value = entry.get("timestamp")
            if raw_value:
                normalized_value = normalize_timestamp(raw_value)
                if normalized_value and normalized_value != raw_value:
                    entry["timestamp"] = normalized_value
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

            for field in ("created_at", "updated_at"):
                raw_value = litter.get(field)
                if raw_value:
                    normalized_value = normalize_timestamp(raw_value)
                    if normalized_value and normalized_value != raw_value:
                        litter[field] = normalized_value
                        changed = True

            for puppy_id, puppy in litter.get("puppies", {}).items():
                measurements = puppy.setdefault("measurements", [])

                for field in ("created_at", "updated_at"):
                    raw_value = puppy.get(field)
                    if raw_value:
                        normalized_value = normalize_timestamp(raw_value)
                        if normalized_value and normalized_value != raw_value:
                            puppy[field] = normalized_value
                            changed = True

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

                    raw_timestamp = measurement.get("timestamp")
                    normalized_timestamp = normalize_timestamp(
                        raw_timestamp,
                        measurement.get("created_at") or now,
                    )
                    if normalized_timestamp and normalized_timestamp != raw_timestamp:
                        measurement["timestamp"] = normalized_timestamp
                        changed = True

                    for field in ("created_at", "updated_at", "deleted_at"):
                        raw_value = measurement.get(field)
                        if raw_value:
                            normalized_value = normalize_timestamp(raw_value)
                            if normalized_value and normalized_value != raw_value:
                                measurement[field] = normalized_value
                                changed = True

                raw_birth_time = puppy.get("birth_time")
                if raw_birth_time:
                    normalized_birth_time = normalize_timestamp(raw_birth_time)
                    if normalized_birth_time and normalized_birth_time != raw_birth_time:
                        puppy["birth_time"] = normalized_birth_time
                        changed = True

                # Versions 0.4.0-0.6.0 could leave the predecessor of a
                # deleted correction marked as superseded. Repair those chains
                # before birth-profile synchronization so the previous version
                # of the same measurement becomes active again.
                if self._repair_deleted_correction_chains(puppy):
                    changed = True

                # Also recover from a dangling superseded_by reference. This
                # can happen when an older buggy frontend/backend combination
                # marked a version as superseded but the replacement record was
                # never persisted. In that case the predecessor is the only
                # recoverable version and must become active again.
                if self._repair_dangling_correction_chains(puppy):
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
            if (
                source.get("superseded_by") == measurement.get("id")
                and measurement.get("superseded_by") is None
                and not (
                    measurement.get("kind") == "birth"
                    and puppy.get("birth_weight") is None
                )
            ):
                source["superseded_by"] = None
                changed = True
        return changed

    @classmethod
    def _repair_dangling_correction_chains(
        cls,
        puppy: dict[str, Any],
    ) -> bool:
        """Reactivate versions whose replacement record no longer exists."""
        measurements = puppy.get("measurements", [])
        known_ids = {
            item.get("id")
            for item in measurements
            if item.get("id")
        }
        changed = False

        for measurement in measurements:
            successor_id = measurement.get("superseded_by")
            if successor_id and successor_id not in known_ids:
                measurement["superseded_by"] = None
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

        active = sorted_measurements(
            candidates,
            active_only=True,
            newest_first=True,
        )
        if active:
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
            if not is_active_measurement(measurement):
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
            "timestamp": normalize_timestamp(new_timestamp, now) or now,
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

    def get_integrity_report(self) -> dict[str, Any]:
        """Return the most recent data integrity report."""
        return deepcopy(self._last_integrity_report)

    async def async_run_integrity_check(
        self,
        *,
        repair: bool = True,
    ) -> dict[str, Any]:
        """Run a full storage integrity check and optionally apply safe repairs."""
        async with self._lock:
            changed, report = inspect_and_repair_data(
                self._data,
                repair=repair,
            )
            self._last_integrity_report = report

            if changed:
                self._add_audit_entry(
                    action="integrity_repair",
                    details={
                        "issues_found": report.get("issues_found", 0),
                        "repairs_applied": report.get("repairs_applied", 0),
                        "unresolved_critical": report.get("unresolved_critical", 0),
                        "repair_counts": report.get("repair_counts", {}),
                    },
                )
                await self.async_save()

            return deepcopy(report)

    def refresh_integrity_report(self) -> dict[str, Any]:
        """Refresh integrity diagnostics without modifying stored data."""
        _changed, report = inspect_and_repair_data(
            self._data,
            repair=False,
        )
        self._last_integrity_report = report
        return deepcopy(report)

    async def async_save(self) -> None:
        """Immediately save data to disk and refresh integrity diagnostics."""
        self._data["updated_at"] = _now_iso()
        _changed, report = inspect_and_repair_data(
            self._data,
            repair=False,
        )
        self._last_integrity_report = report
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
        recurring_reminder_notifications_enabled: bool,
        notify_recovery: bool,
        notify_session_complete: bool,
        notify_entities: list[str] | None = None,
        notification_lead_minutes: int | None = None,
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
            lead_minutes = int(
                before.get(
                    "notification_lead_minutes", DEFAULT_NOTIFICATION_LEAD_MINUTES
                )
                if notification_lead_minutes is None
                else notification_lead_minutes
            )
            if not 0 <= lead_minutes <= 10080:
                raise ValueError(
                    "Notification lead time must be between 0 and 10080 minutes"
                )

            settings = {
                "min_daily_growth_percent": min_growth,
                "max_hours_between_weighings": max_hours,
                "growth_monitoring_days": monitoring_days,
                "notifications_enabled": bool(notifications_enabled),
                "recurring_reminder_notifications_enabled": bool(
                    recurring_reminder_notifications_enabled
                ),
                "notify_recovery": bool(notify_recovery),
                "notify_session_complete": bool(notify_session_complete),
                "notify_entities": [
                    str(entity_id)
                    for entity_id in (notify_entities or [])
                    if str(entity_id).startswith("notify.")
                ],
                "notification_lead_minutes": lead_minutes,
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
                "records": [],
                "last_completed_session": None,
                "growth_analysis": deepcopy(DEFAULT_LITTER_GROWTH_ANALYSIS),
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
        growth_analysis: dict[str, Any] | None = None,
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
                "growth_analysis": deepcopy(litter.get("growth_analysis", {})),
            }

            now = _now_iso()

            litter["name"] = name
            litter["birth_date"] = birth_date
            litter["mother"] = mother
            litter["father"] = father
            litter["growth_analysis"] = _normalize_litter_growth_analysis(
                growth_analysis if growth_analysis is not None else litter.get("growth_analysis")
            )
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
            record_count = len(litter.get("records", [])) + sum(
                len(puppy.get("records", []))
                for puppy in litter.get("puppies", {}).values()
            )

            self._add_audit_entry(
                action="delete_litter",
                litter_id=litter_id,
                details={
                    "name": litter.get("name"),
                    "puppy_count": puppy_count,
                    "measurement_count": measurement_count,
                    "record_count": record_count,
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
        profile_note: str | None = None,
    ) -> str:
        """Add a puppy to a litter."""

        async with self._lock:
            litter = self._require_litter(
                litter_id
            )

            puppy_id = str(uuid4())
            now = _now_iso()
            normalized_birth_time = (
                normalize_timestamp(birth_time, now)
                if birth_time
                else None
            )

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
                "birth_time": normalized_birth_time,
                "birth_measurement_id": None,
                "profile_note": profile_note,
                "active": True,
                "created_at": now,
                "updated_at": now,
                "measurements": [],
                "records": [],
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
                    "birth_time": normalized_birth_time,
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
                            normalized_birth_time
                            or normalize_timestamp(now, now)
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
        profile_note: str | None,
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
                "profile_note": puppy.get("profile_note"),
                "active": puppy.get("active", True),
            }

            now = _now_iso()
            new_birth_weight = float(birth_weight) if birth_weight is not None else None
            normalized_birth_time = (
                normalize_timestamp(birth_time, now)
                if birth_time
                else None
            )

            puppy["name"] = name
            puppy["collar_color"] = collar_color
            puppy["sex"] = sex
            puppy["birth_weight"] = new_birth_weight
            puppy["birth_time"] = normalized_birth_time
            puppy["profile_note"] = profile_note
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
                desired_timestamp = normalized_birth_time or (
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
                        "birth_time": normalized_birth_time,
                        "profile_note": profile_note,
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
                    "record_count": len(puppy.get("records", [])),
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
            normalized_timestamp = normalize_timestamp(timestamp or now, now) or now

            measurement = {
                "id": measurement_id,
                "weight": float(weight),
                "timestamp": normalized_timestamp,
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
        new_timestamp: str | None,
        reason: str | None = None,
    ) -> str:
        """Correct weight and/or timestamp without destroying the original."""
        if new_weight <= 0:
            raise ValueError("Weight must be greater than zero")
        if new_timestamp is not None and not new_timestamp:
            raise ValueError("Timestamp is invalid")

        async with self._lock:
            puppy = self._require_puppy(litter_id, puppy_id)
            original = self._require_measurement(puppy, measurement_id)

            # A missing timestamp explicitly means "keep the measurement time".
            # This prevents weight-only corrections from losing seconds or
            # fractional seconds when a datetime-local editor has lower precision.
            timestamp_source = (
                original.get("timestamp") if new_timestamp is None else new_timestamp
            )
            normalized_new_timestamp = normalize_timestamp(timestamp_source)
            if not normalized_new_timestamp:
                raise ValueError("Timestamp is invalid")

            if original.get("deleted"):
                raise ValueError("Cannot correct a deleted measurement")
            if original.get("superseded_by") is not None:
                raise ValueError("Cannot correct a superseded measurement")

            now = _now_iso()
            replacement = self._create_replacement_measurement(
                puppy,
                original,
                new_weight=float(new_weight),
                new_timestamp=normalized_new_timestamp,
                reason=reason or "Correctie",
                now=now,
            )

            if original.get("kind") == "birth":
                replacement["kind"] = "birth"
                replacement["note"] = "Geboortegewicht"
                puppy["birth_measurement_id"] = replacement["id"]
                puppy["birth_weight"] = float(new_weight)
                puppy["birth_time"] = normalized_new_timestamp

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
                    "new_timestamp": normalized_new_timestamp,
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
    ) -> str:
        """Restore a soft-deleted measurement without creating a broken branch.

        When the deleted record is still the terminal correction in its chain,
        it can simply be reactivated. If that chain has received another
        correction in the meantime, restoring the deleted value creates a new
        terminal correction containing the restored weight/timestamp. This
        keeps every historical version and guarantees one unambiguous active
        version per correction chain.
        """
        async with self._lock:
            puppy = self._require_puppy(litter_id, puppy_id)
            measurement = self._require_measurement(puppy, measurement_id)

            if not measurement.get("deleted", False):
                raise ValueError("Measurement is not deleted")

            now = _now_iso()
            source = self._measurement_by_id(
                puppy,
                measurement.get("source_measurement_id"),
            )
            restored_id = measurement_id
            restored_as_new_version = False

            if source is None:
                # A normal (non-correction) measurement can be restored in place
                # as long as it is not an old superseded version.
                if measurement.get("superseded_by") is not None:
                    raise ValueError(
                        "Cannot restore this historical version because a newer version exists"
                    )
                measurement["deleted"] = False
                measurement["deleted_at"] = None
                measurement["updated_at"] = now
                restored = measurement
            else:
                if source.get("deleted", False):
                    raise ValueError(
                        "Cannot restore this correction because its previous version is deleted"
                    )

                current_successor = source.get("superseded_by")

                if current_successor in (None, measurement_id):
                    # Normal undo/redo path: reconnect the exact historical
                    # correction to its predecessor.
                    source["superseded_by"] = measurement_id
                    source["updated_at"] = now
                    measurement["deleted"] = False
                    measurement["deleted_at"] = None
                    measurement["updated_at"] = now
                    restored = measurement
                else:
                    # The chain changed after this version was deleted. Do not
                    # branch the chain. Clone the deleted value as a new terminal
                    # correction after the current active tip instead.
                    tip = self._follow_replacement_chain(puppy, source)
                    if tip.get("deleted", False):
                        raise ValueError(
                            "Cannot restore this correction because the current correction chain is deleted"
                        )
                    if tip.get("superseded_by") is not None:
                        raise ValueError(
                            "Cannot restore this correction because the current correction chain is inconsistent"
                        )

                    restored = self._create_replacement_measurement(
                        puppy,
                        tip,
                        new_weight=float(measurement["weight"]),
                        new_timestamp=measurement.get("timestamp") or now,
                        reason=reason or "Hersteld vanuit verwijderde versie",
                        now=now,
                    )
                    restored["kind"] = measurement.get("kind")
                    restored["note"] = measurement.get("note")
                    restored_id = restored["id"]
                    restored_as_new_version = True

            puppy["updated_at"] = now
            self._data["litters"][litter_id]["updated_at"] = now

            if restored.get("kind") == "birth":
                puppy["birth_weight"] = float(restored["weight"])
                puppy["birth_time"] = restored.get("timestamp")
                puppy["birth_measurement_id"] = restored.get("id")

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
                    "restored_measurement_id": restored_id,
                    "restored_as_new_version": restored_as_new_version,
                    "supersedes_measurement_id": (
                        restored.get("source_measurement_id")
                        if restored_as_new_version
                        else (source.get("id") if source is not None else None)
                    ),
                },
            )

            await self.async_save()
            return restored_id

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
        measurements = sorted_measurements(
            puppy.get("measurements", []),
            active_only=not include_inactive,
            newest_first=True,
            copy_items=True,
        )
        return measurements

    def get_active_measurements(
        self,
        litter_id: str,
        puppy_id: str,
    ) -> list[dict[str, Any]]:
        """Return currently valid measurements."""
        puppy = self._require_puppy(litter_id, puppy_id)
        return sorted_measurements(
            puppy.get("measurements", []),
            active_only=True,
            copy_items=True,
        )

    async def async_update_profile_note(
        self,
        litter_id: str,
        puppy_id: str,
        profile_note: str | None,
    ) -> None:
        """Update only the persistent profile note for one puppy."""
        async with self._lock:
            litter = self._require_litter(litter_id)
            puppy = self._require_puppy(litter_id, puppy_id)
            before = puppy.get("profile_note")
            now = _now_iso()
            normalized_note = (
                profile_note.strip()
                if isinstance(profile_note, str) and profile_note.strip()
                else None
            )

            puppy["profile_note"] = normalized_note
            puppy["updated_at"] = now
            litter["updated_at"] = now

            self._add_audit_entry(
                action="update_profile_note",
                litter_id=litter_id,
                puppy_id=puppy_id,
                details={"before": before, "after": normalized_note},
            )
            await self.async_save()

    def get_records(
        self,
        litter_id: str,
        puppy_id: str | None = None,
        *,
        include_deleted: bool = False,
        newest_first: bool = False,
    ) -> list[dict[str, Any]]:
        """Return dossier records for one litter or puppy."""
        if puppy_id is None:
            owner = self.get_litter(litter_id)
        else:
            owner = self.get_puppy(litter_id, puppy_id)

        if owner is None:
            return []

        records = owner.get("records", [])
        if not isinstance(records, list):
            return []

        return sorted_records(
            records,
            include_deleted=include_deleted,
            newest_first=newest_first,
            copy_items=True,
        )

    def get_record(
        self,
        litter_id: str,
        record_id: str,
        puppy_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Return one dossier record by id."""
        if puppy_id is None:
            owner = self.get_litter(litter_id)
        else:
            owner = self.get_puppy(litter_id, puppy_id)
        if owner is None:
            return None

        for record in owner.get("records", []):
            if isinstance(record, dict) and record.get("id") == record_id:
                return deepcopy(record)
        return None

    async def async_add_record(
        self,
        litter_id: str,
        *,
        record_type: str,
        puppy_id: str | None = None,
        occurred_at: str | None = None,
        title: str | None = None,
        note: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> str:
        """Add a generic dossier record to a litter or puppy."""
        async with self._lock:
            litter = self._require_litter(litter_id)
            owner = litter if puppy_id is None else self._require_puppy(litter_id, puppy_id)
            now = _now_iso()
            record = create_record(
                litter_id=litter_id,
                puppy_id=puppy_id,
                record_type=validate_record_type(record_type),
                occurred_at=occurred_at,
                title=title,
                note=note,
                data=data,
                now=now,
            )
            owner.setdefault("records", []).append(record)
            owner["updated_at"] = now
            litter["updated_at"] = now

            self._add_audit_entry(
                action="add_record",
                litter_id=litter_id,
                puppy_id=puppy_id,
                record_id=record["id"],
                details={
                    "type": record["type"],
                    "occurred_at": record["occurred_at"],
                },
            )
            await self.async_save()
            return str(record["id"])

    async def async_update_record(
        self,
        litter_id: str,
        record_id: str,
        *,
        record_type: str,
        puppy_id: str | None = None,
        occurred_at: str | None = None,
        title: str | None = None,
        note: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> None:
        """Update a dossier record while preserving its identity and history metadata."""
        async with self._lock:
            litter = self._require_litter(litter_id)
            owner = litter if puppy_id is None else self._require_puppy(litter_id, puppy_id)
            record = self._require_record(owner, record_id)
            before = deepcopy(record)
            now = _now_iso()

            record["type"] = validate_record_type(record_type)
            if occurred_at is not None:
                record["occurred_at"] = normalize_timestamp(occurred_at, now) or now
            record["title"] = title.strip() if isinstance(title, str) and title.strip() else None
            record["note"] = note.strip() if isinstance(note, str) and note.strip() else None
            record["data"] = deepcopy(data) if isinstance(data, dict) else {}
            record["updated_at"] = now
            owner["updated_at"] = now
            litter["updated_at"] = now

            self._add_audit_entry(
                action="update_record",
                litter_id=litter_id,
                puppy_id=puppy_id,
                record_id=record_id,
                details={"before": before, "after": deepcopy(record)},
            )
            await self.async_save()

    async def async_delete_record(
        self,
        litter_id: str,
        record_id: str,
        puppy_id: str | None = None,
    ) -> None:
        """Soft-delete a dossier record."""
        async with self._lock:
            litter = self._require_litter(litter_id)
            owner = litter if puppy_id is None else self._require_puppy(litter_id, puppy_id)
            record = self._require_record(owner, record_id)
            if record.get("deleted", False):
                return

            now = _now_iso()
            record["deleted"] = True
            record["deleted_at"] = now
            record["updated_at"] = now
            owner["updated_at"] = now
            litter["updated_at"] = now
            self._add_audit_entry(
                action="delete_record",
                litter_id=litter_id,
                puppy_id=puppy_id,
                record_id=record_id,
                details={"type": record.get("type")},
            )
            await self.async_save()

    async def async_restore_record(
        self,
        litter_id: str,
        record_id: str,
        puppy_id: str | None = None,
    ) -> None:
        """Restore a soft-deleted dossier record."""
        async with self._lock:
            litter = self._require_litter(litter_id)
            owner = litter if puppy_id is None else self._require_puppy(litter_id, puppy_id)
            record = self._require_record(owner, record_id)
            if not record.get("deleted", False):
                return

            now = _now_iso()
            record["deleted"] = False
            record["deleted_at"] = None
            record["updated_at"] = now
            owner["updated_at"] = now
            litter["updated_at"] = now
            self._add_audit_entry(
                action="restore_record",
                litter_id=litter_id,
                puppy_id=puppy_id,
                record_id=record_id,
                details={"type": record.get("type")},
            )
            await self.async_save()

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

    @staticmethod
    def _require_record(
        owner: dict[str, Any],
        record_id: str,
    ) -> dict[str, Any]:
        """Return dossier record or raise."""
        for record in owner.get("records", []):
            if isinstance(record, dict) and record.get("id") == record_id:
                return record
        raise ValueError(f"Unknown record: {record_id}")

    def _add_audit_entry(
        self,
        action: str,
        litter_id: str | None = None,
        puppy_id: str | None = None,
        measurement_id: str | None = None,
        record_id: str | None = None,
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
                "record_id": record_id,
                "details": details or {},
            }
        )
