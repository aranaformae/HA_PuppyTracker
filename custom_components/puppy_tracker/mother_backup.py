"""Mother dossier export helpers for schema 8 Puppy Tracker backups."""

from __future__ import annotations

import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any

from .const import DOMAIN
from .mother_context import mother_context_payload

MOTHER_EXPORT_VERSION = 5
MOTHER_SCHEMA_VERSION = 8


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_filename(value: str | None, fallback: str = "mother") -> str:
    text = (value or fallback).strip().lower()
    text = re.sub(r"[^a-z0-9_-]+", "-", text)
    return text.strip("-") or fallback


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


def validate_mother_export_document(document: Any) -> dict[str, Any]:
    """Validate a schema-8 mother export without accepting ambiguous context."""
    if not isinstance(document, dict):
        raise ValueError("Mother export root must be an object")
    if document.get("integration") != DOMAIN:
        raise ValueError("Export does not belong to Puppy Tracker")
    if int(document.get("export_version", -1)) != MOTHER_EXPORT_VERSION:
        raise ValueError("Unsupported mother export version")
    if int(document.get("schema_version", -1)) != MOTHER_SCHEMA_VERSION:
        raise ValueError("Unsupported mother storage schema")
    if document.get("scope") != "mother":
        raise ValueError("Not a mother export")

    mother = document.get("mother")
    if not isinstance(mother, dict) or not mother.get("id") or not str(mother.get("name") or "").strip():
        raise ValueError("Mother export profile is incomplete")
    records = mother.get("records", [])
    if not isinstance(records, list) or any(not isinstance(item, dict) for item in records):
        raise ValueError("Mother export records are invalid")

    linked_litters = document.get("linked_litters", [])
    if not isinstance(linked_litters, list) or any(
        not isinstance(item, dict) or not item.get("id") for item in linked_litters
    ):
        raise ValueError("Mother export litter context is invalid")
    linked_ids = {str(item["id"]) for item in linked_litters}

    for record in records:
        if record.get("scope") not in (None, "mother"):
            raise ValueError("Mother export contains a record with another owner scope")
        if record.get("mother_id") not in (None, mother.get("id")):
            raise ValueError("Mother export contains foreign mother records")
        litter_id = str(record.get("litter_id") or "")
        if not litter_id or litter_id not in linked_ids:
            raise ValueError("Mother record has missing or unlisted litter context")

    filter_data = document.get("filter", {})
    if not isinstance(filter_data, dict):
        raise ValueError("Mother export filter is invalid")
    mode = filter_data.get("mode", "all")
    if mode not in {"all", "litter"}:
        raise ValueError("Mother export filter mode is invalid")
    filter_litter_id = filter_data.get("litter_id")
    if mode == "litter":
        if not filter_litter_id or str(filter_litter_id) not in linked_ids:
            raise ValueError("Filtered mother export has invalid litter context")
        if any(str(record.get("litter_id")) != str(filter_litter_id) for record in records):
            raise ValueError("Filtered mother export contains records from another litter")

    if not isinstance(document.get("audit_log", []), list) or any(
        not isinstance(item, dict) for item in document.get("audit_log", [])
    ):
        raise ValueError("Mother export audit log is invalid")
    return deepcopy(document)


def serialize_mother_export(
    data: dict[str, Any],
    mother_id: str,
    *,
    litter_id: str | None = None,
) -> tuple[str, str, str]:
    """Return filename, MIME type, and JSON text for one mother export."""
    document = build_mother_export_document(data, mother_id, litter_id=litter_id)
    validate_mother_export_document(document)
    mother = document["mother"]
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    suffix = ""
    if litter_id is not None:
        litter_name = next(
            (
                item.get("name")
                for item in document["linked_litters"]
                if str(item.get("id")) == str(litter_id)
            ),
            litter_id,
        )
        suffix = f"-{_safe_filename(str(litter_name), 'litter')}"
    filename = (
        f"puppy-tracker-mother-{_safe_filename(str(mother.get('name') or ''), 'mother')}"
        f"{suffix}-{stamp}.json"
    )
    return (
        filename,
        "application/json;charset=utf-8",
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=False),
    )


def describe_mother_export(document: dict[str, Any]) -> dict[str, Any]:
    """Return compact metadata for a mother export preview."""
    validated = validate_mother_export_document(document)
    mother = validated["mother"]
    records = [item for item in mother.get("records", []) if isinstance(item, dict)]
    return {
        "scope": "mother",
        "source_name": str(mother.get("name") or "Moederhond"),
        "mother_id": mother.get("id"),
        "litter_count": len(validated.get("linked_litters", [])),
        "record_count": len(records),
        "audit_count": len(validated.get("audit_log", [])),
        "filter_mode": validated.get("filter", {}).get("mode", "all"),
        "schema_version": int(validated.get("schema_version", -1)),
        "export_version": int(validated.get("export_version", -1)),
    }
