"""Transactional storage commit for mother dossier imports."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .mother_restore import apply_mother_import


async def async_apply_mother_import(
    storage: Any,
    document: dict[str, Any],
    *,
    mode: str | None = None,
    litter_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Apply a mother import atomically and roll back on save failure."""
    before = storage.get_data()
    result = apply_mother_import(
        before,
        document,
        mode=mode,
        litter_map=litter_map,
    )
    candidate = result["data"]

    async with storage._lock:  # Storage owns this lock; import is one transaction.
        previous = storage._data
        storage._data = deepcopy(candidate)
        try:
            await storage.async_save()
        except Exception:
            storage._data = previous
            raise

    if hasattr(storage, "refresh_integrity_report"):
        storage.refresh_integrity_report()

    return {
        "source_name": result.get("mother_name") or "",
        "mother_id": result["mother_id"],
        "mode": result["mode"],
        "records": result["imported_records"],
        "litters": len(set(result["litter_map"].values())),
        "puppies": 0,
        "measurements": 0,
        "litter_map": result["litter_map"],
    }
