"""Pure schema migration helpers for persistent mother profiles."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from .records import normalize_record
from .storage import _now_iso


def _clean_name(value: str | None) -> str | None:
    """Return one normalized display name or None."""
    if not isinstance(value, str):
        return None
    value = value.strip()
    return value or None


def _name_key(value: str | None) -> str:
    """Return a stable case-insensitive name key."""
    return (_clean_name(value) or "").casefold()


def migrate_mother_scope_data(data: dict[str, Any]) -> bool:
    """Create/relink reusable mother profiles without requiring a storage object.

    The migration is intentionally pure with respect to the storage wrapper: it
    only mutates the supplied candidate dictionary. Backup restore can therefore
    apply the exact same mother migration as normal runtime loading before a
    candidate is committed.
    """
    changed = False
    now = _now_iso()
    mothers = data.setdefault("mothers", {})
    if not isinstance(mothers, dict):
        return False

    by_name = {
        _name_key(mother.get("name")): str(mother_id)
        for mother_id, mother in mothers.items()
        if isinstance(mother, dict) and _name_key(mother.get("name"))
    }

    for litter_id, litter in data.get("litters", {}).items():
        if not isinstance(litter, dict):
            continue
        mother_name = _clean_name(litter.get("mother"))
        mother_id = litter.get("mother_id")
        mother = mothers.get(str(mother_id)) if mother_id else None

        if mother is None and mother_name:
            existing_id = by_name.get(_name_key(mother_name))
            if existing_id:
                mother_id = existing_id
                mother = mothers[existing_id]
            else:
                mother_id = str(uuid4())
                mother = {
                    "id": mother_id,
                    "name": mother_name,
                    "profile_note": None,
                    "records": [],
                    "created_at": now,
                    "updated_at": now,
                }
                mothers[mother_id] = mother
                by_name[_name_key(mother_name)] = mother_id
                changed = True

        if mother is not None:
            defaults = {
                "id": str(mother_id),
                "name": mother_name or "Moederhond",
                "profile_note": None,
                "records": [],
                "created_at": now,
                "updated_at": now,
            }
            for key, value in defaults.items():
                if key not in mother:
                    mother[key] = value
                    changed = True
            if litter.get("mother_id") != str(mother_id):
                litter["mother_id"] = str(mother_id)
                changed = True
            if not mother_name and mother.get("name"):
                litter["mother"] = mother.get("name")
                changed = True
        elif "mother_id" not in litter:
            litter["mother_id"] = None
            changed = True

    linked_litters: dict[str, str] = {}
    for litter_id, litter in data.get("litters", {}).items():
        if isinstance(litter, dict) and litter.get("mother_id"):
            linked_litters.setdefault(str(litter["mother_id"]), str(litter_id))

    for mother_id, mother in mothers.items():
        if not isinstance(mother, dict):
            continue
        records = mother.get("records")
        if not isinstance(records, list):
            continue
        fallback_litter_id = linked_litters.get(str(mother_id), "")
        for record in records:
            if not isinstance(record, dict):
                continue
            litter_id = str(record.get("litter_id") or fallback_litter_id)
            if litter_id and normalize_record(
                record,
                litter_id=litter_id,
                mother_id=str(mother_id),
                puppy_id=None,
                now=now,
            ):
                changed = True

    return changed
