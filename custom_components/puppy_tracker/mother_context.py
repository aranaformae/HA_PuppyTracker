"""Helpers for presenting one continuous mother dossier in litter context."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .records import sorted_records


def mother_litter_ids(data: dict[str, Any], mother_id: str) -> list[str]:
    """Return litter ids linked to a mother, newest litter metadata first."""
    linked: list[tuple[str, str]] = []
    for litter_id, litter in data.get("litters", {}).items():
        if not isinstance(litter, dict):
            continue
        if str(litter.get("mother_id") or "") != str(mother_id):
            continue
        sort_value = str(
            litter.get("birth_date")
            or litter.get("created_at")
            or litter.get("updated_at")
            or ""
        )
        linked.append((str(litter_id), sort_value))
    linked.sort(key=lambda item: (item[1], item[0]), reverse=True)
    return [item[0] for item in linked]


def mother_records(
    mother: dict[str, Any] | None,
    *,
    litter_id: str | None = None,
    include_deleted: bool = False,
    newest_first: bool = True,
) -> list[dict[str, Any]]:
    """Return mother records, optionally restricted to one litter context."""
    if not isinstance(mother, dict):
        return []
    records = mother.get("records", [])
    if not isinstance(records, list):
        return []
    selected = [
        item
        for item in records
        if isinstance(item, dict)
        and (litter_id is None or str(item.get("litter_id") or "") == str(litter_id))
    ]
    return sorted_records(
        selected,
        include_deleted=include_deleted,
        newest_first=newest_first,
        copy_items=True,
    )


def mother_context_payload(
    data: dict[str, Any],
    mother_id: str,
    *,
    litter_id: str | None = None,
    include_deleted: bool = False,
) -> dict[str, Any] | None:
    """Build a UI/API-safe mother dossier payload with optional litter filter."""
    mother = data.get("mothers", {}).get(mother_id)
    if not isinstance(mother, dict):
        return None

    linked_ids = mother_litter_ids(data, mother_id)
    if litter_id is not None and str(litter_id) not in linked_ids:
        raise ValueError("Mother is not linked to this litter")

    litter_names = {
        linked_id: str(data.get("litters", {}).get(linked_id, {}).get("name") or linked_id)
        for linked_id in linked_ids
    }
    records = mother_records(
        mother,
        litter_id=litter_id,
        include_deleted=include_deleted,
        newest_first=True,
    )
    enriched: list[dict[str, Any]] = []
    for record in records:
        item = deepcopy(record)
        record_litter_id = str(item.get("litter_id") or "")
        item["litter_name"] = litter_names.get(record_litter_id, record_litter_id or None)
        enriched.append(item)

    return {
        "mother": {
            "id": str(mother.get("id") or mother_id),
            "name": mother.get("name"),
            "profile_note": mother.get("profile_note"),
        },
        "filter": {
            "mode": "litter" if litter_id is not None else "all",
            "litter_id": litter_id,
        },
        "linked_litters": [
            {
                "id": linked_id,
                "name": litter_names[linked_id],
            }
            for linked_id in linked_ids
        ],
        "records": enriched,
        "record_count": len(enriched),
    }
