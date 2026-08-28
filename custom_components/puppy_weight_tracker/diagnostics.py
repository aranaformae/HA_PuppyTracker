"""Diagnostics support for Puppy Weight Tracker."""

from __future__ import annotations

from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant

from .const import DOMAIN, STORAGE_VERSION, VERSION
from .frontend import FRONTEND_VERSION
from .storage import PuppyWeightStorage


def _runtime_storage(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> PuppyWeightStorage | None:
    """Return storage for the config entry."""
    runtime = hass.data.get(DOMAIN, {}).get(entry.entry_id)
    if not isinstance(runtime, dict):
        return None
    storage = runtime.get("storage")
    return storage if isinstance(storage, PuppyWeightStorage) else None


def _storage_counts(data: dict[str, Any]) -> dict[str, int]:
    """Return privacy-safe aggregate counts."""
    litters = data.get("litters", {})
    puppy_count = 0
    active_puppy_count = 0
    measurement_versions = 0
    active_measurements = 0
    deleted_measurements = 0
    superseded_measurements = 0

    for litter in litters.values():
        if not isinstance(litter, dict):
            continue
        for puppy in litter.get("puppies", {}).values():
            if not isinstance(puppy, dict):
                continue
            puppy_count += 1
            if puppy.get("active", True):
                active_puppy_count += 1
            for measurement in puppy.get("measurements", []):
                if not isinstance(measurement, dict):
                    continue
                measurement_versions += 1
                if measurement.get("deleted", False):
                    deleted_measurements += 1
                elif measurement.get("superseded_by") is not None:
                    superseded_measurements += 1
                else:
                    active_measurements += 1

    return {
        "litters": len(litters),
        "puppies": puppy_count,
        "active_puppies": active_puppy_count,
        "measurement_versions": measurement_versions,
        "active_measurements": active_measurements,
        "deleted_measurements": deleted_measurements,
        "superseded_measurements": superseded_measurements,
        "audit_entries": len(data.get("audit_log", [])),
    }


async def async_get_config_entry_diagnostics(
    hass: HomeAssistant,
    entry: ConfigEntry,
) -> dict[str, Any]:
    """Return privacy-safe diagnostics for the config entry."""
    storage = _runtime_storage(hass, entry)
    if storage is None:
        return {
            "integration_version": VERSION,
            "frontend_version": FRONTEND_VERSION,
            "loaded": False,
        }

    data = storage.get_data()
    settings = storage.get_settings()
    integrity = storage.refresh_integrity_report()

    return {
        "integration_version": VERSION,
        "frontend_version": FRONTEND_VERSION,
        "loaded": True,
        "storage_version": STORAGE_VERSION,
        "schema_version": data.get("schema_version"),
        "storage_created_at": data.get("created_at"),
        "storage_updated_at": data.get("updated_at"),
        "counts": _storage_counts(data),
        "monitoring": {
            "min_daily_growth_percent": settings.get("min_daily_growth_percent"),
            "max_hours_between_weighings": settings.get("max_hours_between_weighings"),
            "growth_monitoring_days": settings.get("growth_monitoring_days"),
            "notifications_enabled": bool(settings.get("notifications_enabled", False)),
            "notify_recovery": bool(settings.get("notify_recovery", False)),
            "notify_session_complete": bool(settings.get("notify_session_complete", False)),
            "notify_target_count": len(settings.get("notify_entities", [])),
        },
        "integrity": integrity,
    }
