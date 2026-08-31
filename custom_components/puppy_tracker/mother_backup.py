"""Mother dossier export helpers for schema 8 Puppy Tracker backups."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from .const import DOMAIN
from .mother_context import mother_context_payload

MOTHER_EXPORT_VERSION = 5
MOTHER_SCHEMA_VERSION = 8


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _mother_audit(
    data: dict[str, Any],
    mother_id: str,
    *,
    litter_id: str | None = None,
) -> list[dict[str, Any]]:
    """Return audit entries attributable to one mother dossier."""
    result: list[dict[str, Any]] = []
    for item in data.get("audit_log", []):
        if not isinstance(item, dict):
            continue
        details = item.get("details") if isinstance(item.get("details"), dict) else {}
        if str(details.get("mother_id") or "") != str(mother_id):
            continue
        if litter_id is not None and str(item.get("litter_id") or "") != str(litter_id):
            continue
        result.append(deepcopy(item))
    return result


def build_mother_export_document(
    data: dict[str, Any],
    mother_id: str,
    *,
    litter_id: str | None = None,
) -> dict[str, Any]:
    """Build a mother export for all history or one litter context."""
    context = mother_context_payload(
        data,
        mother_id,
        litter_id=litter_id,
        include_deleted=True,
    )
    if context is None:
        raise ValueError("Unknown mother")

    mother = data.get("mothers", {}).get(mother_id)
    if not isinstance(mother, dict):
        raise ValueError("Unknown mother")

    exported_mother = deepcopy(mother)
    exported_mother["records"] = context["records"]
    for record in exported_mother["records"]:
        record.pop("litter_name", None)

    linked_litters: list[dict[str, Any]] = []
    for item in context["linked_litters"]:
        linked_id = str(item["id"])
        if litter_id is not None and linked_id != str(litter_id):
            continue
        litter = data.get("litters", {}).get(linked_id, {})
        linked_litters.append(
            {
                "id": linked_id,
                "name": litter.get("name"),
                "birth_date": litter.get("birth_date"),
                "father": litter.get("father"),
            }
        )

    return {
        "export_version": MOTHER_EXPORT_VERSION,
        "exported_at": _now_iso(),
        "integration": DOMAIN,
        "schema_version": MOTHER_SCHEMA_VERSION,
        "scope": "mother",
        "filter": {
            "mode": "litter" if litter_id is not None else "all",
            "litter_id": litter_id,
        },
        "mother": exported_mother,
        "linked_litters": linked_litters,
        "audit_log": _mother_audit(data, mother_id, litter_id=litter_id),
    }


def describe_mother_export(document: dict[str, Any]) -> dict[str, Any]:
    """Return compact metadata for a mother export preview."""
    if document.get("scope") != "mother":
        raise ValueError("Not a mother export")
    mother = document.get("mother")
    if not isinstance(mother, dict):
        raise ValueError("Mother export is incomplete")
    records = [item for item in mother.get("records", []) if isinstance(item, dict)]
    return {
        "scope": "mother",
        "source_name": str(mother.get("name") or "Moederhond"),
        "mother_id": mother.get("id"),
        "litter_count": len(document.get("linked_litters", [])),
        "record_count": len(records),
        "filter_mode": document.get("filter", {}).get("mode", "all"),
        "schema_version": int(document.get("schema_version", -1)),
        "export_version": int(document.get("export_version", -1)),
    }
