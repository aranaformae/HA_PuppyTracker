"""Generic dossier record helpers for Puppy Tracker."""

from __future__ import annotations

import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from .time_utils import normalize_timestamp, timestamp_sort_key

RECORD_SCOPE_LITTER = "litter"
RECORD_SCOPE_MOTHER = "mother"
RECORD_SCOPE_PUPPY = "puppy"
VALID_RECORD_SCOPES = frozenset(
    {RECORD_SCOPE_LITTER, RECORD_SCOPE_MOTHER, RECORD_SCOPE_PUPPY}
)

# These are the first planned dossier types. Storage deliberately accepts any
# valid snake_case type so new modules can be added without a storage migration.
RECORD_TYPE_NOTE = "note"
RECORD_TYPE_TEMPERATURE = "temperature"
RECORD_TYPE_VACCINATION = "vaccination"
RECORD_TYPE_TEST = "test"
RECORD_TYPE_DEWORMING = "deworming"
RECORD_TYPE_MEDICATION = "medication"
RECORD_TYPE_VET_VISIT = "vet_visit"
RECORD_TYPE_MILESTONE = "milestone"
RECORD_TYPE_OTHER = "other"

PLANNED_RECORD_TYPES = frozenset(
    {
        RECORD_TYPE_NOTE,
        RECORD_TYPE_TEMPERATURE,
        RECORD_TYPE_VACCINATION,
        RECORD_TYPE_TEST,
        RECORD_TYPE_DEWORMING,
        RECORD_TYPE_MEDICATION,
        RECORD_TYPE_VET_VISIT,
        RECORD_TYPE_MILESTONE,
        RECORD_TYPE_OTHER,
    }
)

_RECORD_TYPE_PATTERN = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


def _now_iso() -> str:
    """Return current UTC time as an ISO string."""
    return datetime.now(timezone.utc).isoformat()


def _record_scope(*, puppy_id: str | None, mother_id: str | None) -> str:
    """Return the canonical record scope for one owner."""
    if puppy_id is not None and mother_id is not None:
        raise ValueError("A dossier record cannot belong to both mother and puppy")
    if puppy_id is not None:
        return RECORD_SCOPE_PUPPY
    if mother_id is not None:
        return RECORD_SCOPE_MOTHER
    return RECORD_SCOPE_LITTER


def validate_record_type(value: str) -> str:
    """Validate and return a future-proof dossier record type."""
    record_type = str(value or "").strip()
    if not _RECORD_TYPE_PATTERN.fullmatch(record_type):
        raise ValueError(
            "Record type must be lowercase snake_case and at most 64 characters"
        )
    return record_type


def create_record(
    *,
    litter_id: str,
    record_type: str,
    puppy_id: str | None = None,
    mother_id: str | None = None,
    occurred_at: str | None = None,
    title: str | None = None,
    note: str | None = None,
    data: dict[str, Any] | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    """Create a canonical dossier record envelope."""
    created_at = normalize_timestamp(now or _now_iso()) or _now_iso()
    normalized_occurred_at = (
        normalize_timestamp(occurred_at, created_at) if occurred_at else created_at
    )
    scope = _record_scope(puppy_id=puppy_id, mother_id=mother_id)

    return {
        "id": str(uuid4()),
        "type": validate_record_type(record_type),
        "scope": scope,
        "litter_id": litter_id,
        "mother_id": mother_id,
        "puppy_id": puppy_id,
        "occurred_at": normalized_occurred_at,
        "created_at": created_at,
        "updated_at": created_at,
        "deleted": False,
        "deleted_at": None,
        "title": title.strip() if isinstance(title, str) and title.strip() else None,
        "note": note.strip() if isinstance(note, str) and note.strip() else None,
        "data": deepcopy(data) if isinstance(data, dict) else {},
    }


def normalize_record(
    record: dict[str, Any],
    *,
    litter_id: str,
    puppy_id: str | None,
    mother_id: str | None = None,
    now: str | None = None,
) -> bool:
    """Normalize a stored dossier record in place.

    Only structural, unambiguous defaults are applied. Invalid user data is
    left intact for the integrity checker to report instead of being guessed.
    """
    changed = False
    fallback_now = normalize_timestamp(now or _now_iso()) or _now_iso()
    scope = _record_scope(puppy_id=puppy_id, mother_id=mother_id)

    defaults: dict[str, Any] = {
        "id": str(uuid4()),
        "type": RECORD_TYPE_NOTE,
        "scope": scope,
        "litter_id": litter_id,
        "mother_id": mother_id,
        "puppy_id": puppy_id,
        "occurred_at": fallback_now,
        "created_at": fallback_now,
        "updated_at": fallback_now,
        "deleted": False,
        "deleted_at": None,
        "title": None,
        "note": None,
        "data": {},
    }

    for key, value in defaults.items():
        if key not in record:
            record[key] = deepcopy(value)
            changed = True

    # Ownership is determined by where the record is stored, so it is safe to
    # repair stale/missing envelope ownership metadata during migration.
    owner_values = {
        "scope": scope,
        "litter_id": litter_id,
        "mother_id": mother_id,
        "puppy_id": puppy_id,
    }
    for key, value in owner_values.items():
        if record.get(key) != value:
            record[key] = value
            changed = True

    for field in ("occurred_at", "created_at", "updated_at", "deleted_at"):
        raw_value = record.get(field)
        if not raw_value:
            continue
        normalized = normalize_timestamp(str(raw_value))
        if normalized and normalized != raw_value:
            record[field] = normalized
            changed = True

    if record.get("deleted") is False and record.get("deleted_at") is not None:
        record["deleted_at"] = None
        changed = True

    if record.get("data") is None:
        record["data"] = {}
        changed = True

    return changed


def record_sort_key(record: dict[str, Any]) -> tuple[float, float, str]:
    """Return a deterministic chronological sort key for a dossier record."""
    return (
        timestamp_sort_key(record.get("occurred_at")),
        timestamp_sort_key(record.get("created_at")),
        str(record.get("id") or ""),
    )


def sorted_records(
    records: list[dict[str, Any]],
    *,
    include_deleted: bool = False,
    newest_first: bool = False,
    copy_items: bool = True,
) -> list[dict[str, Any]]:
    """Return dossier records in deterministic chronological order."""
    selected = [
        item
        for item in records
        if isinstance(item, dict) and (include_deleted or not item.get("deleted", False))
    ]
    selected.sort(key=record_sort_key, reverse=newest_first)
    return deepcopy(selected) if copy_items else selected
