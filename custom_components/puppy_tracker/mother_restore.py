"""Plan and apply safe mother dossier imports."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

MOTHER_IMPORT_MERGE = "merge_existing"
MOTHER_IMPORT_NEW = "new_profile"
MOTHER_IMPORT_MODES = frozenset({MOTHER_IMPORT_MERGE, MOTHER_IMPORT_NEW})
DEFAULT_MOTHER_IMPORT_MODE = MOTHER_IMPORT_MERGE
_AUDIT_ID_FIELDS = frozenset({"litter_id", "mother_id", "record_id"})


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_name(value: Any) -> str:
    return str(value or "").strip()


def _name_key(value: Any) -> str:
    return _clean_name(value).casefold()


def find_matching_mother(data: dict[str, Any], source_name: str) -> dict[str, Any] | None:
    """Return an existing mother profile with the same normalized name."""
    key = _name_key(source_name)
    if not key:
        return None
    for mother in data.get("mothers", {}).values():
        if isinstance(mother, dict) and _name_key(mother.get("name")) == key:
            return mother
    return None


def mother_import_options(data: dict[str, Any], document: dict[str, Any]) -> dict[str, Any]:
    """Describe the import choices for a validated mother export.

    Merge is the default when a matching local mother exists. Creating a new
    profile is always available so the UI can explicitly let the user choose.
    """
    if document.get("scope") != "mother":
        raise ValueError("Not a mother export")
    source = document.get("mother")
    if not isinstance(source, dict):
        raise ValueError("Mother export is incomplete")
    source_name = _clean_name(source.get("name"))
    if not source_name:
        raise ValueError("Mother export has no name")

    existing = find_matching_mother(data, source_name)
    modes = [MOTHER_IMPORT_MERGE, MOTHER_IMPORT_NEW] if existing else [MOTHER_IMPORT_NEW]
    default_mode = MOTHER_IMPORT_MERGE if existing else MOTHER_IMPORT_NEW
    return {
        "source_name": source_name,
        "matching_mother_id": existing.get("id") if existing else None,
        "matching_mother_name": existing.get("name") if existing else None,
        "available_modes": modes,
        "default_mode": default_mode,
    }


def plan_mother_import(
    data: dict[str, Any],
    document: dict[str, Any],
    *,
    mode: str | None = None,
) -> dict[str, Any]:
    """Return a non-mutating import plan with unresolved litter contexts.

    Mother records retain their source litter context. Exact local litter IDs
    are considered resolved; every other source litter is surfaced explicitly
    for UI mapping instead of guessing by name.
    """
    options = mother_import_options(data, document)
    selected_mode = mode or options["default_mode"]
    if selected_mode not in MOTHER_IMPORT_MODES:
        raise ValueError(f"Unsupported mother import mode: {selected_mode}")
    if selected_mode == MOTHER_IMPORT_MERGE and not options["matching_mother_id"]:
        raise ValueError("No matching mother profile is available to merge into")

    local_litters = data.get("litters", {})
    resolved: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []
    for source_litter in document.get("linked_litters", []):
        if not isinstance(source_litter, dict) or not source_litter.get("id"):
            continue
        source_id = str(source_litter["id"])
        item = {
            "source_litter_id": source_id,
            "source_litter_name": source_litter.get("name"),
            "target_litter_id": source_id if source_id in local_litters else None,
        }
        (resolved if item["target_litter_id"] else unresolved).append(item)

    return {
        **options,
        "mode": selected_mode,
        "target_mother_id": (
            options["matching_mother_id"] if selected_mode == MOTHER_IMPORT_MERGE else None
        ),
        "resolved_litters": resolved,
        "unresolved_litters": unresolved,
        "requires_litter_mapping": bool(unresolved),
    }


def _unique_import_name(data: dict[str, Any], source_name: str) -> str:
    """Return a clear, unique name for an explicitly separate import."""
    existing = {
        _name_key(item.get("name"))
        for item in data.get("mothers", {}).values()
        if isinstance(item, dict)
    }
    if _name_key(source_name) not in existing:
        return source_name
    candidate = f"{source_name} (geïmporteerd)"
    index = 2
    while _name_key(candidate) in existing:
        candidate = f"{source_name} (geïmporteerd {index})"
        index += 1
    return candidate


def _resolved_litter_map(
    data: dict[str, Any],
    document: dict[str, Any],
    litter_map: dict[str, str] | None,
) -> dict[str, str]:
    """Resolve every source litter to an explicit existing local litter."""
    local_litters = data.get("litters", {})
    supplied = {str(key): str(value) for key, value in (litter_map or {}).items()}
    resolved: dict[str, str] = {}

    source_ids: set[str] = set()
    for item in document.get("linked_litters", []):
        if isinstance(item, dict) and item.get("id"):
            source_ids.add(str(item["id"]))
    mother = document.get("mother")
    if isinstance(mother, dict):
        for record in mother.get("records", []):
            if isinstance(record, dict) and record.get("litter_id"):
                source_ids.add(str(record["litter_id"]))

    for source_id in source_ids:
        target_id = supplied.get(source_id)
        if target_id is None and source_id in local_litters:
            target_id = source_id
        if target_id is None:
            raise ValueError(f"Missing litter mapping for source litter: {source_id}")
        if target_id not in local_litters:
            raise ValueError(f"Unknown target litter: {target_id}")
        resolved[source_id] = target_id
    return resolved


def _remap_mother_audit(
    value: Any,
    *,
    litter_map: dict[str, str],
    mother_map: dict[str, str],
    record_map: dict[str, str],
    key: str | None = None,
) -> Any:
    """Remap ownership/reference fields in imported mother audit data."""
    if isinstance(value, dict):
        return {
            item_key: _remap_mother_audit(
                item,
                litter_map=litter_map,
                mother_map=mother_map,
                record_map=record_map,
                key=str(item_key),
            )
            for item_key, item in value.items()
        }
    if isinstance(value, list):
        return [
            _remap_mother_audit(
                item,
                litter_map=litter_map,
                mother_map=mother_map,
                record_map=record_map,
                key=key,
            )
            for item in value
        ]
    if isinstance(value, str) and key in _AUDIT_ID_FIELDS:
        mapping = (
            litter_map
            if key == "litter_id"
            else mother_map
            if key == "mother_id"
            else record_map
        )
        return mapping.get(value, value)
    return deepcopy(value)


def apply_mother_import(
    data: dict[str, Any],
    document: dict[str, Any],
    *,
    mode: str | None = None,
    litter_map: dict[str, str] | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    """Return a safely imported candidate without mutating the input data.

    Record IDs are always regenerated, so importing the same backup can never
    overwrite or accidentally alias an existing dossier record. Every source
    litter context must resolve explicitly. A target litter may only be linked
    to the selected mother (or be unlinked) to avoid silently changing lineage.
    """
    plan = plan_mother_import(data, document, mode=mode)
    source = document.get("mother")
    if not isinstance(source, dict):
        raise ValueError("Mother export is incomplete")

    candidate = deepcopy(data)
    candidate.setdefault("mothers", {})
    candidate.setdefault("litters", {})
    candidate.setdefault("audit_log", [])
    timestamp = now or _now_iso()
    mappings = _resolved_litter_map(candidate, document, litter_map)

    if plan["mode"] == MOTHER_IMPORT_MERGE:
        mother_id = str(plan["target_mother_id"])
        mother = candidate["mothers"].get(mother_id)
        if not isinstance(mother, dict):
            raise ValueError("Target mother profile no longer exists")
    else:
        mother_id = str(uuid4())
        mother = {
            "id": mother_id,
            "name": _unique_import_name(candidate, plan["source_name"]),
            "profile_note": source.get("profile_note"),
            "records": [],
            "created_at": timestamp,
            "updated_at": timestamp,
        }
        candidate["mothers"][mother_id] = mother

    for target_litter_id in set(mappings.values()):
        litter = candidate["litters"][target_litter_id]
        linked_mother = litter.get("mother_id")
        if linked_mother not in (None, "", mother_id):
            raise ValueError(
                f"Target litter {target_litter_id} is linked to another mother"
            )

    imported_records = 0
    record_map: dict[str, str] = {}
    for raw_record in source.get("records", []):
        if not isinstance(raw_record, dict):
            continue
        source_litter_id = str(raw_record.get("litter_id") or "")
        if not source_litter_id or source_litter_id not in mappings:
            raise ValueError("Mother record has unresolved litter context")
        record = deepcopy(raw_record)
        record["id"] = str(uuid4())
        record_map[str(raw_record.get("id"))] = record["id"]
        record["scope"] = "mother"
        record["mother_id"] = mother_id
        record["puppy_id"] = None
        record["litter_id"] = mappings[source_litter_id]
        record["created_at"] = record.get("created_at") or timestamp
        record["updated_at"] = timestamp
        mother.setdefault("records", []).append(record)
        imported_records += 1

    imported_audit_entries = 0
    mother_map = {str(source.get("id")): mother_id}
    for raw_audit in document.get("audit_log", []):
        if not isinstance(raw_audit, dict):
            continue
        audit = _remap_mother_audit(
            raw_audit,
            litter_map=mappings,
            mother_map=mother_map,
            record_map=record_map,
        )
        audit["id"] = str(uuid4())
        candidate["audit_log"].append(audit)
        imported_audit_entries += 1

    if plan["mode"] == MOTHER_IMPORT_MERGE and not mother.get("profile_note"):
        mother["profile_note"] = source.get("profile_note")
    mother["updated_at"] = timestamp

    linked_targets = sorted(set(mappings.values()))
    for target_litter_id in linked_targets:
        litter = candidate["litters"][target_litter_id]
        litter["mother_id"] = mother_id
        litter["mother"] = mother.get("name")
        litter["updated_at"] = timestamp

    candidate["schema_version"] = max(int(candidate.get("schema_version", 1)), 8)
    candidate["updated_at"] = timestamp
    candidate["audit_log"].append(
        {
            "id": str(uuid4()),
            "timestamp": timestamp,
            "action": "import_mother",
            "litter_id": linked_targets[0] if len(linked_targets) == 1 else None,
            "puppy_id": None,
            "measurement_id": None,
            "record_id": None,
            "details": {
                "mother_id": mother_id,
                "source_mother_id": source.get("id"),
                "source_name": plan["source_name"],
        "mode": plan["mode"],
        "imported_records": imported_records,
        "imported_audit_entries": imported_audit_entries,
        "litter_map": deepcopy(mappings),
            },
        }
    )

    return {
        "data": candidate,
        "mother_id": mother_id,
        "mother_name": mother.get("name"),
        "mode": plan["mode"],
        "imported_records": imported_records,
        "litter_map": mappings,
    }
