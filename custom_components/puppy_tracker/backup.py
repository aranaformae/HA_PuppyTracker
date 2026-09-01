"""Validated JSON backup, export, preview, and restore helpers."""

from __future__ import annotations

import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .backup_scheduler_integrity import validate_scheduler_references
from .care_programs import normalize_care_program_backup_data
from .care_reminders import CARE_REMINDER_CATEGORIES, MAX_CARE_REMINDER_LEAD_DAYS
from .const import DOMAIN
from .integrity import inspect_and_repair_data
from .mother_integrity import inspect_mother_data, merge_integrity_reports
from .mother_schema import migrate_mother_scope_data
from .mother_storage import MOTHER_SCHEMA_VERSION
from .recurring_reminders import normalize_recurring_reminder_backup_data
from .storage import PuppyTrackerStorage

EXPORT_VERSION = 5
LEGACY_EXPORT_VERSION = 4
SCHEDULER_BACKUP_VERSION = 1
LEGACY_SCHEMA_VERSION = 7
CURRENT_SCHEMA_VERSION = MOTHER_SCHEMA_VERSION
SUPPORTED_SCHEMA_VERSIONS = frozenset({LEGACY_SCHEMA_VERSION, CURRENT_SCHEMA_VERSION})
SUPPORTED_EXPORT_VERSIONS = frozenset({LEGACY_EXPORT_VERSION, EXPORT_VERSION})
VALID_SCOPES = frozenset({"full", "litter", "puppy"})
VALID_IMPORT_MODES = {
    "full": frozenset({"replace_all", "merge_as_new"}),
    "litter": frozenset({"new_litter", "existing_litter"}),
    "puppy": frozenset({"new_litter", "existing_litter"}),
}


class BackupValidationError(ValueError):
    """Raised when a backup or requested restore operation is unsafe."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_filename(value: str | None, fallback: str = "backup") -> str:
    text = (value or fallback).strip().lower()
    text = re.sub(r"[^a-z0-9_-]+", "-", text)
    return text.strip("-") or fallback


def _audit_for_litter(data: dict[str, Any], litter_id: str) -> list[dict[str, Any]]:
    return [
        deepcopy(item)
        for item in data.get("audit_log", [])
        if isinstance(item, dict) and item.get("litter_id") == litter_id
    ]


def _audit_for_puppy(
    data: dict[str, Any],
    litter_id: str,
    puppy_id: str,
) -> list[dict[str, Any]]:
    return [
        deepcopy(item)
        for item in data.get("audit_log", [])
        if (
            isinstance(item, dict)
            and item.get("litter_id") == litter_id
            and item.get("puppy_id") == puppy_id
        )
    ]


def _validate_care_reminder_settings(settings: Any) -> dict[str, Any]:
    """Validate and normalize portable care reminder preferences."""
    if not isinstance(settings, dict):
        raise BackupValidationError(
            "invalid_backup",
            "Full backup care reminder settings are missing or invalid",
        )

    try:
        lead_days = int(settings["lead_days"])
    except (KeyError, TypeError, ValueError) as err:
        raise BackupValidationError(
            "invalid_backup",
            "Full backup care reminder lead time is invalid",
        ) from err
    if not 0 <= lead_days <= MAX_CARE_REMINDER_LEAD_DAYS:
        raise BackupValidationError(
            "invalid_backup",
            "Full backup care reminder lead time is out of range",
        )

    categories = settings.get("categories")
    if not isinstance(categories, dict):
        raise BackupValidationError(
            "invalid_backup",
            "Full backup care reminder categories are invalid",
        )
    if any(category not in categories for category in CARE_REMINDER_CATEGORIES):
        raise BackupValidationError(
            "invalid_backup",
            "Full backup care reminder categories are incomplete",
        )

    if "states" in settings:
        raise BackupValidationError(
            "invalid_backup",
            "Care reminder delivery state must not be stored in backups",
        )

    return {
        "lead_days": lead_days,
        "categories": {
            category: bool(categories[category])
            for category in CARE_REMINDER_CATEGORIES
        },
    }


def _validate_scheduler_container_ids(
    snapshot: dict[str, Any],
    *,
    container_key: str,
    label: str,
) -> None:
    """Reject active scheduler entries whose container key disagrees with id."""
    container = snapshot.get(container_key)
    if not isinstance(container, dict):
        return
    for key, value in container.items():
        key_text = str(key)
        if not isinstance(value, dict):
            continue
        if not key_text or str(value.get("id") or "") != key_text:
            raise BackupValidationError(
                "invalid_backup",
                f"{label} backup identifier does not match its container key",
            )


def _validate_scheduler_backup(schedulers: Any) -> dict[str, Any]:
    """Validate and normalize the versioned full-backup scheduler envelope."""
    if not isinstance(schedulers, dict):
        raise BackupValidationError(
            "invalid_backup",
            "Full backup scheduler data is missing or invalid",
        )

    allowed_keys = {"version", "care_programs", "recurring_reminders"}
    if set(schedulers) - allowed_keys:
        raise BackupValidationError(
            "invalid_backup",
            "Full backup scheduler data contains unsupported fields",
        )

    try:
        version = int(schedulers.get("version"))
    except (TypeError, ValueError) as err:
        raise BackupValidationError(
            "invalid_backup",
            "Full backup scheduler version is missing or invalid",
        ) from err
    if version != SCHEDULER_BACKUP_VERSION:
        raise BackupValidationError(
            "unsupported_export_version",
            f"Unsupported scheduler backup version: {version}",
        )

    care_programs = schedulers.get("care_programs")
    recurring_reminders = schedulers.get("recurring_reminders")
    if not isinstance(care_programs, dict) or not isinstance(recurring_reminders, dict):
        raise BackupValidationError(
            "invalid_backup",
            "Full backup scheduler stores are incomplete",
        )

    _validate_scheduler_container_ids(
        care_programs,
        container_key="programs",
        label="Care program",
    )
    _validate_scheduler_container_ids(
        recurring_reminders,
        container_key="reminders",
        label="Recurring reminder",
    )

    try:
        normalized_care_programs = normalize_care_program_backup_data(care_programs)
        normalized_recurring_reminders = normalize_recurring_reminder_backup_data(
            recurring_reminders
        )
    except ValueError as err:
        raise BackupValidationError(
            "invalid_backup",
            f"Full backup scheduler data is invalid: {err}",
        ) from err

    return {
        "version": SCHEDULER_BACKUP_VERSION,
        "care_programs": normalized_care_programs,
        "recurring_reminders": normalized_recurring_reminders,
    }


def _validate_scheduler_references(
    data: dict[str, Any],
    schedulers: dict[str, Any],
) -> None:
    """Translate cross-store ownership failures into backup validation errors."""
    try:
        validate_scheduler_references(data, schedulers)
    except ValueError as err:
        raise BackupValidationError(
            "invalid_backup",
            f"Full backup scheduler references are invalid: {err}",
        ) from err


def _scheduler_backup_has_entries(schedulers: dict[str, Any]) -> bool:
    """Return whether a scheduler envelope contains definitions or quarantine."""
    care_programs = schedulers.get("care_programs", {})
    recurring = schedulers.get("recurring_reminders", {})
    return any(
        bool(container.get(key))
        for container, keys in (
            (care_programs, ("programs", "quarantined_programs")),
            (recurring, ("reminders", "quarantined_reminders")),
        )
        if isinstance(container, dict)
        for key in keys
    )


def build_export_document(
    storage: PuppyTrackerStorage,
    *,
    scope: str,
    litter_id: str | None = None,
    puppy_id: str | None = None,
    care_reminder_settings: dict[str, Any] | None = None,
    scheduler_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build an authoritative JSON backup document."""
    if scope not in VALID_SCOPES:
        raise ValueError(f"Unsupported export scope: {scope}")

    data = storage.get_data()
    try:
        schema_version = int(data.get("schema_version"))
    except (TypeError, ValueError) as err:
        raise ValueError("Storage schema version is missing or invalid") from err
    if schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        raise ValueError(f"Unsupported storage schema for backup: {schema_version}")

    document: dict[str, Any] = {
        "export_version": EXPORT_VERSION,
        "exported_at": _now_iso(),
        "integration": DOMAIN,
        "schema_version": schema_version,
        "scope": scope,
    }

    if scope == "full":
        if care_reminder_settings is None:
            raise ValueError("care_reminder_settings is required for a full backup")
        if scheduler_data is None:
            raise ValueError("scheduler_data is required for a full backup")
        document["data"] = data
        document["care_reminders"] = _validate_care_reminder_settings(
            care_reminder_settings
        )
        normalized_schedulers = _validate_scheduler_backup(scheduler_data)
        _validate_scheduler_references(data, normalized_schedulers)
        document["schedulers"] = normalized_schedulers
        return document

    if scheduler_data is not None:
        raise ValueError("scheduler_data is only valid for full backups")

    if not litter_id:
        raise ValueError("litter_id is required")
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")

    if scope == "litter":
        document["litter"] = litter
        document["audit_log"] = _audit_for_litter(data, litter_id)
        return document

    if not puppy_id:
        raise ValueError("puppy_id is required")
    puppy = storage.get_puppy(litter_id, puppy_id)
    if puppy is None:
        raise ValueError("Unknown puppy")

    document["source_litter"] = {
        "id": litter_id,
        "name": litter.get("name"),
        "birth_date": litter.get("birth_date"),
        "mother": litter.get("mother"),
        "father": litter.get("father"),
    }
    document["puppy"] = puppy
    document["audit_log"] = _audit_for_puppy(data, litter_id, puppy_id)
    return document


def serialize_export(
    storage: PuppyTrackerStorage,
    *,
    scope: str,
    litter_id: str | None = None,
    puppy_id: str | None = None,
    care_reminder_settings: dict[str, Any] | None = None,
    scheduler_data: dict[str, Any] | None = None,
) -> tuple[str, str, str]:
    """Return filename, MIME type, and JSON text for one backup."""
    document = build_export_document(
        storage,
        scope=scope,
        litter_id=litter_id,
        puppy_id=puppy_id,
        care_reminder_settings=care_reminder_settings,
        scheduler_data=scheduler_data,
    )
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")

    if scope == "full":
        filename = f"puppy-tracker-full-backup-{stamp}.json"
    elif scope == "litter":
        litter = document["litter"]
        filename = (
            f"puppy-tracker-litter-{_safe_filename(litter.get('name'), 'litter')}-{stamp}.json"
        )
    else:
        puppy = document["puppy"]
        filename = (
            f"puppy-tracker-puppy-{_safe_filename(puppy.get('name'), 'puppy')}-{stamp}.json"
        )

    return (
        filename,
        "application/json;charset=utf-8",
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=False),
    )


def parse_export_json(content: str) -> dict[str, Any]:
    """Parse and validate a Puppy Tracker JSON export."""
    try:
        raw = json.loads(content)
    except (TypeError, json.JSONDecodeError) as err:
        raise BackupValidationError("invalid_backup_json", "Backup is not valid JSON") from err

    if not isinstance(raw, dict):
        raise BackupValidationError("invalid_backup", "Backup root must be an object")
    if raw.get("integration") != DOMAIN:
        raise BackupValidationError(
            "invalid_backup",
            "Backup does not belong to Puppy Tracker",
        )

    try:
        export_version = int(raw.get("export_version"))
    except (TypeError, ValueError) as err:
        raise BackupValidationError("invalid_backup", "Missing export version") from err

    if export_version not in SUPPORTED_EXPORT_VERSIONS:
        raise BackupValidationError(
            "unsupported_export_version",
            f"Unsupported backup export version: {export_version}",
        )

    try:
        schema_version = int(raw.get("schema_version"))
    except (TypeError, ValueError) as err:
        raise BackupValidationError("invalid_backup", "Missing storage schema version") from err

    if schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        supported = ", ".join(str(item) for item in sorted(SUPPORTED_SCHEMA_VERSIONS))
        raise BackupValidationError(
            "unsupported_schema_version",
            (
                f"Backup schema {schema_version} is not supported by this restore workflow; "
                f"supported schemas are {supported}"
            ),
        )

    document = deepcopy(raw)
    scope = document.get("scope")
    if scope not in VALID_SCOPES:
        raise BackupValidationError("invalid_backup", f"Unsupported backup scope: {scope}")

    if scope == "full":
        data = document.get("data")
        if not isinstance(data, dict) or not isinstance(data.get("litters"), dict):
            raise BackupValidationError("invalid_backup", "Full backup data is incomplete")
        if not isinstance(data.get("audit_log"), list):
            raise BackupValidationError("invalid_backup", "Full backup audit log is invalid")
        try:
            data_schema_version = int(data.get("schema_version"))
        except (TypeError, ValueError) as err:
            raise BackupValidationError(
                "unsupported_schema_version",
                "Full backup data has no valid storage schema",
            ) from err
        if data_schema_version != schema_version:
            raise BackupValidationError(
                "unsupported_schema_version",
                "Full backup data uses a different storage schema",
            )
        document["care_reminders"] = _validate_care_reminder_settings(
            document.get("care_reminders")
        )
        if export_version == LEGACY_EXPORT_VERSION:
            if "schedulers" in document:
                raise BackupValidationError(
                    "invalid_backup",
                    "Version 4 full backups must not contain scheduler data",
                )
        else:
            document["schedulers"] = _validate_scheduler_backup(
                document.get("schedulers")
            )

    elif scope == "litter":
        if "schedulers" in document:
            raise BackupValidationError(
                "invalid_backup",
                "Partial backups must not contain scheduler data",
            )
        litter = document.get("litter")
        if not isinstance(litter, dict) or not litter.get("id"):
            raise BackupValidationError("invalid_backup", "Litter backup is incomplete")
        if not isinstance(litter.get("puppies"), dict):
            raise BackupValidationError("invalid_backup", "Litter puppy container is invalid")
        if not isinstance(document.get("audit_log", []), list):
            raise BackupValidationError("invalid_backup", "Litter audit log is invalid")

    else:
        if "schedulers" in document:
            raise BackupValidationError(
                "invalid_backup",
                "Partial backups must not contain scheduler data",
            )
        source_litter = document.get("source_litter")
        puppy = document.get("puppy")
        if not isinstance(source_litter, dict) or not source_litter.get("id"):
            raise BackupValidationError("invalid_backup", "Puppy source litter is incomplete")
        if not isinstance(puppy, dict) or not puppy.get("id"):
            raise BackupValidationError("invalid_backup", "Puppy backup is incomplete")
        if not isinstance(puppy.get("measurements", []), list):
            raise BackupValidationError("invalid_backup", "Puppy measurements are invalid")
        if not isinstance(puppy.get("records", []), list):
            raise BackupValidationError("invalid_backup", "Puppy records are invalid")
        if not isinstance(document.get("audit_log", []), list):
            raise BackupValidationError("invalid_backup", "Puppy audit log is invalid")

    return document


def _counts_for_puppy(puppy: dict[str, Any]) -> tuple[int, int]:
    return (
        len([item for item in puppy.get("measurements", []) if isinstance(item, dict)]),
        len([item for item in puppy.get("records", []) if isinstance(item, dict)]),
    )


def describe_backup(document: dict[str, Any]) -> dict[str, Any]:
    """Return a compact, UI-safe description of a validated backup."""
    scope = str(document["scope"])
    litters = 0
    puppies = 0
    measurements = 0
    records = 0
    source_name = ""

    if scope == "full":
        source = document["data"].get("litters", {})
        litters = len(source)
        for litter in source.values():
            if not isinstance(litter, dict):
                continue
            records += len([item for item in litter.get("records", []) if isinstance(item, dict)])
            for puppy in litter.get("puppies", {}).values():
                if not isinstance(puppy, dict):
                    continue
                puppies += 1
                m_count, r_count = _counts_for_puppy(puppy)
                measurements += m_count
                records += r_count
        source_name = "Puppy Tracker"

    elif scope == "litter":
        litter = document["litter"]
        litters = 1
        source_name = str(litter.get("name") or "Litter")
        records += len([item for item in litter.get("records", []) if isinstance(item, dict)])
        for puppy in litter.get("puppies", {}).values():
            if not isinstance(puppy, dict):
                continue
            puppies += 1
            m_count, r_count = _counts_for_puppy(puppy)
            measurements += m_count
            records += r_count

    else:
        puppy = document["puppy"]
        puppies = 1
        source_name = str(puppy.get("name") or "Puppy")
        measurements, records = _counts_for_puppy(puppy)

    return {
        "scope": scope,
        "source_name": source_name,
        "litters": litters,
        "puppies": puppies,
        "measurements": measurements,
        "records": records,
        "schema_version": int(document["schema_version"]),
        "export_version": int(document["export_version"]),
    }


def _register_id(id_map: dict[str, str], raw_id: Any) -> None:
    if raw_id is None:
        return
    value = str(raw_id)
    if value and value not in id_map:
        id_map[value] = str(uuid4())


def _collect_puppy_ids(puppy_key: Any, puppy: dict[str, Any], id_map: dict[str, str]) -> None:
    _register_id(id_map, puppy_key)
    _register_id(id_map, puppy.get("id"))
    for measurement in puppy.get("measurements", []):
        if isinstance(measurement, dict):
            _register_id(id_map, measurement.get("id"))
    for record in puppy.get("records", []):
        if isinstance(record, dict):
            _register_id(id_map, record.get("id"))


def _collect_litter_ids(litter: dict[str, Any]) -> dict[str, str]:
    id_map: dict[str, str] = {}
    _register_id(id_map, litter.get("id"))
    for puppy_key, puppy in litter.get("puppies", {}).items():
        if isinstance(puppy, dict):
            _collect_puppy_ids(puppy_key, puppy, id_map)
    for record in litter.get("records", []):
        if isinstance(record, dict):
            _register_id(id_map, record.get("id"))
    return id_map


def _remap_tree(value: Any, id_map: dict[str, str]) -> Any:
    if isinstance(value, str):
        return id_map.get(value, value)
    if isinstance(value, list):
        return [_remap_tree(item, id_map) for item in value]
    if isinstance(value, dict):
        remapped: dict[Any, Any] = {}
        for key, item in value.items():
            new_key = id_map.get(key, key) if isinstance(key, str) else key
            remapped[new_key] = _remap_tree(item, id_map)
        return remapped
    return deepcopy(value)


def _append_import_audit(
    candidate: dict[str, Any],
    *,
    scope: str,
    mode: str,
    source_name: str,
    source_export_version: int,
    target_litter_id: str | None = None,
    imported_puppy_id: str | None = None,
) -> None:
    candidate.setdefault("audit_log", []).append(
        {
            "timestamp": _now_iso(),
            "action": f"import_{scope}",
            "litter_id": target_litter_id,
            "puppy_id": imported_puppy_id,
            "measurement_id": None,
            "details": {
                "mode": mode,
                "source_name": source_name,
                "export_version": source_export_version,
            },
        }
    )


def _normalize_candidate_schema(candidate: dict[str, Any]) -> None:
    """Migrate supported restore candidates to the current mother-aware schema."""
    try:
        schema_version = int(candidate.get("schema_version"))
    except (TypeError, ValueError) as err:
        raise BackupValidationError(
            "unsupported_schema_version",
            "Restore candidate has no valid storage schema",
        ) from err
    if schema_version not in SUPPORTED_SCHEMA_VERSIONS:
        raise BackupValidationError(
            "unsupported_schema_version",
            "Restore candidate has an unsupported storage schema",
        )

    migrate_mother_scope_data(candidate)
    candidate["schema_version"] = CURRENT_SCHEMA_VERSION


def _validate_candidate(candidate: dict[str, Any]) -> dict[str, Any]:
    _normalize_candidate_schema(candidate)
    _changed, base_report = inspect_and_repair_data(candidate, repair=False)
    _mother_changed, mother_report = inspect_mother_data(candidate, repair=False)
    report = merge_integrity_reports(base_report, mother_report)
    if report.get("unresolved_critical", 0):
        raise BackupValidationError(
            "invalid_backup",
            (
                "Restore candidate contains "
                f"{report.get('unresolved_critical', 0)} unresolved critical integrity issue(s)"
            ),
        )
    return report


def _remap_litter(
    litter: dict[str, Any],
    audit_log: list[dict[str, Any]],
    *,
    target_litter_id: str | None = None,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, str]]:
    old_litter_id = str(litter.get("id") or "")
    if not old_litter_id:
        raise BackupValidationError("invalid_backup", "Imported litter has no identifier")

    id_map = _collect_litter_ids(litter)
    new_litter_id = target_litter_id or str(uuid4())
    id_map[old_litter_id] = new_litter_id

    remapped_litter = _remap_tree(litter, id_map)
    remapped_litter["id"] = new_litter_id
    remapped_audit = [
        _remap_tree(item, id_map)
        for item in audit_log
        if isinstance(item, dict)
    ]
    return remapped_litter, remapped_audit, id_map


def _remap_puppy(
    puppy: dict[str, Any],
    audit_log: list[dict[str, Any]],
    *,
    source_litter_id: str,
    target_litter_id: str,
) -> tuple[str, dict[str, Any], list[dict[str, Any]], dict[str, str]]:
    old_puppy_id = str(puppy.get("id") or "")
    if not old_puppy_id:
        raise BackupValidationError("invalid_backup", "Imported puppy has no identifier")

    id_map: dict[str, str] = {source_litter_id: target_litter_id}
    _collect_puppy_ids(old_puppy_id, puppy, id_map)
    new_puppy_id = id_map[old_puppy_id]

    remapped_puppy = _remap_tree(puppy, id_map)
    remapped_puppy["id"] = new_puppy_id

    # Ownership is authoritative from the destination container.
    for record in remapped_puppy.get("records", []):
        if isinstance(record, dict):
            record["scope"] = "puppy"
            record["litter_id"] = target_litter_id
            record["puppy_id"] = new_puppy_id

    remapped_audit = [
        _remap_tree(item, id_map)
        for item in audit_log
        if isinstance(item, dict)
    ]
    return new_puppy_id, remapped_puppy, remapped_audit, id_map


def _new_litter_from_source(source_litter: dict[str, Any], litter_id: str) -> dict[str, Any]:
    now = _now_iso()
    return {
        "id": litter_id,
        "name": source_litter.get("name") or "Imported litter",
        "birth_date": source_litter.get("birth_date"),
        "mother": source_litter.get("mother"),
        "father": source_litter.get("father"),
        "active": True,
        "created_at": now,
        "updated_at": now,
        "puppies": {},
        "records": [],
        "last_completed_session": None,
    }


def prepare_import(
    storage: PuppyTrackerStorage,
    document: dict[str, Any],
    *,
    mode: str,
    target_litter_id: str | None = None,
) -> dict[str, Any]:
    """Build and validate a restore candidate without mutating storage."""
    scope = str(document.get("scope") or "")
    if scope not in VALID_SCOPES:
        raise BackupValidationError("invalid_backup", "Backup scope is invalid")
    if mode not in VALID_IMPORT_MODES[scope]:
        raise BackupValidationError(
            "invalid_import_mode",
            f"Import mode {mode!r} is not valid for {scope} backups",
        )

    current = storage.get_data()
    base_updated_at = current.get("updated_at")
    candidate = deepcopy(current)
    description = describe_backup(document)
    source_export_version = int(description["export_version"])
    result: dict[str, Any] = {
        **description,
        "mode": mode,
        "replaces_all": False,
        "target_litter_id": target_litter_id,
    }

    if scope == "full":
        source_data = deepcopy(document["data"])
        if mode == "replace_all":
            candidate = source_data
            result["replaces_all"] = True
            result["care_reminders"] = deepcopy(document["care_reminders"])
            if "schedulers" in document:
                result["schedulers"] = deepcopy(document["schedulers"])
            _append_import_audit(
                candidate,
                scope=scope,
                mode=mode,
                source_name=description["source_name"],
                source_export_version=source_export_version,
            )
        else:
            schedulers = document.get("schedulers")
            if isinstance(schedulers, dict) and _scheduler_backup_has_entries(schedulers):
                raise BackupValidationError(
                    "invalid_import_mode",
                    (
                        "Full backups containing scheduler definitions can only use replace_all "
                        "until scheduler identifier remapping is supported"
                    ),
                )
            for source_litter_id, source_litter in source_data.get("litters", {}).items():
                if not isinstance(source_litter, dict):
                    raise BackupValidationError("invalid_backup", "Invalid litter in full backup")
                source_litter = deepcopy(source_litter)
                source_litter.setdefault("id", str(source_litter_id))
                source_audit = [
                    item
                    for item in source_data.get("audit_log", [])
                    if isinstance(item, dict) and item.get("litter_id") == str(source_litter_id)
                ]
                remapped, remapped_audit, _id_map = _remap_litter(
                    source_litter,
                    source_audit,
                )
                new_litter_id = str(remapped["id"])
                candidate["litters"][new_litter_id] = remapped
                candidate.setdefault("audit_log", []).extend(remapped_audit)
            _append_import_audit(
                candidate,
                scope=scope,
                mode=mode,
                source_name=description["source_name"],
                source_export_version=source_export_version,
            )

    elif scope == "litter":
        source_litter = deepcopy(document["litter"])
        source_audit = deepcopy(document.get("audit_log", []))
        if mode == "new_litter":
            remapped, remapped_audit, _id_map = _remap_litter(
                source_litter,
                source_audit,
            )
            new_litter_id = str(remapped["id"])
            candidate["litters"][new_litter_id] = remapped
            candidate.setdefault("audit_log", []).extend(remapped_audit)
            result["target_litter_id"] = new_litter_id
            _append_import_audit(
                candidate,
                scope=scope,
                mode=mode,
                source_name=description["source_name"],
                source_export_version=source_export_version,
                target_litter_id=new_litter_id,
            )
        else:
            if not target_litter_id or target_litter_id not in candidate.get("litters", {}):
                raise BackupValidationError(
                    "invalid_import_target",
                    "Target litter does not exist",
                )
            remapped, remapped_audit, _id_map = _remap_litter(
                source_litter,
                source_audit,
                target_litter_id=target_litter_id,
            )
            target = candidate["litters"][target_litter_id]
            for puppy_id, puppy in remapped.get("puppies", {}).items():
                target.setdefault("puppies", {})[puppy_id] = puppy
            target.setdefault("records", []).extend(remapped.get("records", []))
            target["updated_at"] = _now_iso()
            candidate.setdefault("audit_log", []).extend(remapped_audit)
            _append_import_audit(
                candidate,
                scope=scope,
                mode=mode,
                source_name=description["source_name"],
                source_export_version=source_export_version,
                target_litter_id=target_litter_id,
            )

    else:
        source_litter = deepcopy(document["source_litter"])
        source_litter_id = str(source_litter["id"])
        source_puppy = deepcopy(document["puppy"])
        source_audit = deepcopy(document.get("audit_log", []))

        if mode == "new_litter":
            destination_litter_id = str(uuid4())
            destination_litter = _new_litter_from_source(
                source_litter,
                destination_litter_id,
            )
            candidate["litters"][destination_litter_id] = destination_litter
        else:
            if not target_litter_id or target_litter_id not in candidate.get("litters", {}):
                raise BackupValidationError(
                    "invalid_import_target",
                    "Target litter does not exist",
                )
            destination_litter_id = target_litter_id
            destination_litter = candidate["litters"][destination_litter_id]

        new_puppy_id, remapped_puppy, remapped_audit, _id_map = _remap_puppy(
            source_puppy,
            source_audit,
            source_litter_id=source_litter_id,
            target_litter_id=destination_litter_id,
        )
        destination_litter.setdefault("puppies", {})[new_puppy_id] = remapped_puppy
        destination_litter["updated_at"] = _now_iso()
        candidate.setdefault("audit_log", []).extend(remapped_audit)
        result["target_litter_id"] = destination_litter_id
        result["imported_puppy_id"] = new_puppy_id
        _append_import_audit(
            candidate,
            scope=scope,
            mode=mode,
            source_name=description["source_name"],
            source_export_version=source_export_version,
            target_litter_id=destination_litter_id,
            imported_puppy_id=new_puppy_id,
        )

    report = _validate_candidate(candidate)
    if scope == "full" and mode == "replace_all":
        schedulers = result.get("schedulers")
        if isinstance(schedulers, dict):
            _validate_scheduler_references(candidate, schedulers)
    result["integrity_warnings"] = int(report.get("unresolved_warnings", 0))
    result["integrity_critical"] = int(report.get("unresolved_critical", 0))

    return {
        "candidate": candidate,
        "base_updated_at": base_updated_at,
        "summary": result,
    }


async def async_apply_import(
    storage: PuppyTrackerStorage,
    plan: dict[str, Any],
) -> dict[str, Any]:
    """Atomically apply a prepared restore plan."""
    candidate = deepcopy(plan.get("candidate"))
    if not isinstance(candidate, dict):
        raise BackupValidationError("invalid_import_plan", "Restore plan has no candidate data")

    async with storage._lock:
        current = storage.get_data()
        if current.get("updated_at") != plan.get("base_updated_at"):
            raise BackupValidationError(
                "storage_changed",
                "Puppy Tracker data changed after the preview; review the import again",
            )

        before = deepcopy(storage._data)
        storage._data = candidate
        try:
            await storage.async_save()
        except Exception:
            storage._data = before
            try:
                await storage.async_save()
            except Exception:
                # The original in-memory state is restored even when disk recovery
                # itself also fails. Preserve the first exception for diagnostics.
                pass
            raise

    return deepcopy(plan.get("summary", {}))