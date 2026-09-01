"""Coordinated multi-store backup restore with best-effort rollback."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .backup import BackupValidationError, CURRENT_SCHEMA_VERSION, async_apply_import
from .care_programs import AgeBasedCareProgramStore
from .care_reminders import CareReminderStore
from .integrity import inspect_and_repair_data
from .recurring_reminders import RecurringReminderStore
from .storage import PuppyTrackerStorage


async def async_restore_storage_snapshot(
    storage: PuppyTrackerStorage,
    snapshot: dict[str, Any],
) -> None:
    """Restore an exact same-schema storage snapshot without changing timestamps.

    This helper intentionally writes through the underlying Home Assistant Store
    instead of ``PuppyTrackerStorage.async_save`` because normal saves advance
    ``updated_at``. Transaction rollback must restore the exact pre-import state.
    """
    if not isinstance(snapshot, dict):
        raise BackupValidationError(
            "invalid_import_plan",
            "Storage rollback snapshot must be an object",
        )
    restored = deepcopy(snapshot)
    if int(restored.get("schema_version", -1)) != CURRENT_SCHEMA_VERSION:
        raise BackupValidationError(
            "invalid_import_plan",
            "Storage rollback snapshot has an unsupported schema",
        )
    _changed, report = inspect_and_repair_data(restored, repair=False)
    if report.get("unresolved_critical", 0):
        raise BackupValidationError(
            "invalid_import_plan",
            "Storage rollback snapshot contains unresolved critical integrity issues",
        )

    async with storage._lock:
        before_data = deepcopy(storage._data)
        before_report = deepcopy(storage._last_integrity_report)
        storage._data = restored
        storage._last_integrity_report = report
        try:
            await storage._store.async_save(storage._data)
        except Exception:
            storage._data = before_data
            storage._last_integrity_report = before_report
            try:
                await storage._store.async_save(storage._data)
            except Exception:
                pass
            raise


async def _attempt_rollback(
    errors: list[str],
    label: str,
    operation: Any,
) -> None:
    """Run one rollback operation without hiding the primary restore failure."""
    try:
        await operation
    except Exception as err:  # noqa: BLE001 - rollback must continue across stores
        errors.append(f"{label}: {type(err).__name__}: {err}")


async def async_apply_import_transaction(
    storage: PuppyTrackerStorage,
    plan: dict[str, Any],
    *,
    care_reminders: CareReminderStore | None = None,
    care_programs: AgeBasedCareProgramStore | None = None,
    recurring_reminders: RecurringReminderStore | None = None,
) -> dict[str, Any]:
    """Apply one import and coordinate rollback across external stores.

    Partial imports only touch the main storage. Full ``replace_all`` restores
    portable legacy care reminder preferences and, for backup v5, both scheduler
    stores. This is coordinated rollback across separate Home Assistant storage
    files; it is not filesystem-level crash atomicity.
    """
    summary = plan.get("summary")
    if not isinstance(summary, dict):
        raise BackupValidationError(
            "invalid_import_plan",
            "Restore plan has no summary",
        )

    if not summary.get("replaces_all"):
        return await async_apply_import(storage, plan)

    care_settings = summary.get("care_reminders")
    if care_reminders is None or not isinstance(care_settings, dict):
        raise BackupValidationError(
            "invalid_import_plan",
            "Full restore requires the loaded care reminder store",
        )

    schedulers = summary.get("schedulers")
    if schedulers is not None:
        if not isinstance(schedulers, dict):
            raise BackupValidationError(
                "invalid_import_plan",
                "Full restore scheduler data is invalid",
            )
        if care_programs is None or recurring_reminders is None:
            raise BackupValidationError(
                "invalid_import_plan",
                "Backup v5 full restore requires both loaded scheduler stores",
            )
        scheduler_care = schedulers.get("care_programs")
        scheduler_recurring = schedulers.get("recurring_reminders")
        if not isinstance(scheduler_care, dict) or not isinstance(
            scheduler_recurring, dict
        ):
            raise BackupValidationError(
                "invalid_import_plan",
                "Backup v5 scheduler restore data is incomplete",
            )
    else:
        scheduler_care = None
        scheduler_recurring = None

    before_storage = storage.get_data()
    before_care = care_reminders.get_snapshot_data()
    before_programs = care_programs.get_backup_data() if scheduler_care is not None else None
    before_recurring = (
        recurring_reminders.get_backup_data() if scheduler_recurring is not None else None
    )

    try:
        result = await async_apply_import(storage, plan)
        await care_reminders.async_restore_backup_settings(care_settings)
        if scheduler_care is not None and care_programs is not None:
            await care_programs.async_restore_backup_data(scheduler_care)
        if scheduler_recurring is not None and recurring_reminders is not None:
            await recurring_reminders.async_restore_backup_data(scheduler_recurring)
        return result
    except Exception as primary:  # noqa: BLE001 - preserve original failure after rollback
        rollback_errors: list[str] = []

        if before_recurring is not None and recurring_reminders is not None:
            await _attempt_rollback(
                rollback_errors,
                "recurring_reminders",
                recurring_reminders.async_restore_backup_data(before_recurring),
            )
        if before_programs is not None and care_programs is not None:
            await _attempt_rollback(
                rollback_errors,
                "care_programs",
                care_programs.async_restore_backup_data(before_programs),
            )
        await _attempt_rollback(
            rollback_errors,
            "care_reminders",
            care_reminders.async_restore_snapshot_data(before_care),
        )
        await _attempt_rollback(
            rollback_errors,
            "storage",
            async_restore_storage_snapshot(storage, before_storage),
        )

        if rollback_errors and hasattr(primary, "add_note"):
            primary.add_note(
                "Puppy Tracker rollback also encountered: " + "; ".join(rollback_errors)
            )
        raise
