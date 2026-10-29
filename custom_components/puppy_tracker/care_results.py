"""Convert age-based care occurrence results into canonical puppy dossier records."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Protocol

CARE_RESULT_STATUSES = {"completed", "missed"}
COURSE_ADMIN_FIELDS = {
    "medication": {"medication", "dose", "unit", "route", "administered_by", "frequency", "duration"},
    "deworming": {"product", "active_ingredient", "amount", "unit", "dose", "route", "batch_number", "administered_by", "weight_grams"},
}


class PuppyRecordStorage(Protocol):
    """Storage contract needed to persist one puppy dossier record."""

    async def async_add_record(
        self,
        litter_id: str,
        *,
        record_type: str,
        puppy_id: str | None = None,
        occurred_at: str | None = None,
        title: str | None = None,
        note: str | None = None,
        data: dict[str, Any] | None = None,
    ) -> str: ...


def normalize_care_result(
    program: dict[str, Any],
    result: dict[str, Any],
) -> dict[str, Any]:
    """Validate a structured result against one care program's enabled fields."""
    status = str(result.get("status") or "completed").strip().lower()
    if status not in CARE_RESULT_STATUSES:
        raise ValueError("status must be completed or missed")

    allowed_fields = set(program.get("result_fields") or [])
    normalized: dict[str, Any] = {"status": status}

    if "result" in allowed_fields:
        value = str(result.get("result") or "").strip()
        normalized["result"] = value or None
    elif result.get("result") not in (None, ""):
        raise ValueError("result is not enabled for this care program")

    if "score" in allowed_fields:
        value = result.get("score")
        if value in (None, ""):
            normalized["score"] = None
        else:
            try:
                normalized["score"] = float(value)
            except (TypeError, ValueError) as err:
                raise ValueError("score must be numeric") from err
    elif result.get("score") not in (None, ""):
        raise ValueError("score is not enabled for this care program")

    if "note" in allowed_fields:
        value = str(result.get("note") or "").strip()
        normalized["note"] = value or None
    elif result.get("note") not in (None, ""):
        raise ValueError("note is not enabled for this care program")

    extra_data = result.get("data")
    if extra_data is not None and not isinstance(extra_data, dict):
        raise ValueError("data must be an object")
    normalized["data"] = deepcopy(extra_data) if isinstance(extra_data, dict) else {}
    if program.get("schedule_type") == "course":
        record_type = program.get("record_type")
        product_key = "medication" if record_type == "medication" else "product"
        allowed = COURSE_ADMIN_FIELDS.get(record_type, set())
        if set(normalized["data"]) - allowed:
            raise ValueError("Unsupported treatment administration field")
        if status == "missed" and normalized["data"]:
            raise ValueError("A missed course moment cannot contain administration data")
        if status == "completed":
            product = str(normalized["data"].get(product_key) or "").strip()
            if not product:
                raise ValueError("Enter the product actually administered")
            normalized["data"] = {
                key: str(value).strip()
                for key, value in normalized["data"].items()
                if value not in (None, "") and str(value).strip()
            }
    return normalized


def normalize_course_record_edit(
    previous: dict[str, Any], record_type: str, data: dict[str, Any] | None,
) -> dict[str, Any]:
    """Keep a dossier correction consistent with its treatment result identity."""
    old_data = previous.get("data") if isinstance(previous.get("data"), dict) else {}
    if old_data.get("care_schedule_type") != "course":
        return deepcopy(data) if isinstance(data, dict) else {}
    if record_type != previous.get("type") or record_type not in COURSE_ADMIN_FIELDS:
        raise ValueError("Treatment result category cannot be changed")
    if not isinstance(data, dict):
        raise ValueError("Treatment result data is required")
    for key in ("care_program_id", "care_program_revision", "care_occurrence_id", "care_schedule_type", "care_scheduled_at"):
        if data.get(key) != old_data.get(key):
            raise ValueError("Treatment result schedule identity cannot be changed")
    if "next_due_date" in data:
        raise ValueError("A treatment result cannot create a separate next-due schedule")
    result = deepcopy(data)
    status = str(result.get("care_status") or "")
    if status not in CARE_RESULT_STATUSES:
        raise ValueError("Treatment result status must be completed or missed")
    actual = {key: result[key] for key in COURSE_ADMIN_FIELDS[record_type] if result.get(key) not in (None, "")}
    if status == "missed":
        if actual:
            raise ValueError("A missed treatment cannot contain administration data")
        result["care_data"] = {}
        result["care_result"] = None
        result["care_score"] = None
    else:
        normalized = normalize_care_result(
            {"schedule_type": "course", "record_type": record_type, "result_fields": []},
            {"status": "completed", "data": actual},
        )
        result["care_data"] = normalized["data"]
        result["care_result"] = None
        result["care_score"] = None
    return result


def care_result_record_payload(
    program: dict[str, Any],
    occurrence: dict[str, Any],
    result: dict[str, Any],
    *,
    occurred_at: str | None = None,
) -> dict[str, Any]:
    """Build the canonical dossier payload for one occurrence result."""
    program_id = str(program.get("id") or "").strip()
    program_revision = int(program.get("revision") or 1)
    occurrence_id = str(occurrence.get("id") or "").strip()
    occurrence_revision = int(occurrence.get("program_revision") or 1)
    litter_id = str(occurrence.get("litter_id") or "").strip()
    puppy_id = str(occurrence.get("puppy_id") or "").strip()

    if not program_id or occurrence.get("program_id") != program_id:
        raise ValueError("occurrence does not belong to care program")
    if occurrence_revision != program_revision:
        raise ValueError("occurrence revision does not match care program")
    if not occurrence_id:
        raise ValueError("occurrence id is required")
    if not litter_id or litter_id != str(program.get("litter_id") or "").strip():
        raise ValueError("occurrence litter does not match care program")
    if not puppy_id:
        raise ValueError("occurrence puppy_id is required")

    normalized = normalize_care_result(program, result)
    structured_data = {
        "care_program_id": program_id,
        "care_program_revision": program_revision,
        "care_occurrence_id": occurrence_id,
        "care_scheduled_at": occurrence.get("scheduled_at"),
        "care_instruction": occurrence.get("instructions"),
        "care_status": normalized["status"],
        "care_result": normalized.get("result"),
        "care_score": normalized.get("score"),
        "care_data": normalized.get("data", {}),
    }
    if program.get("schedule_type") == "course":
        structured_data.update(normalized.get("data", {}))
        structured_data["care_schedule_type"] = "course"
    else:
        structured_data["care_age_days"] = int(occurrence.get("age_days") or 0)

    return {
        "litter_id": litter_id,
        "puppy_id": puppy_id,
        "record_type": str(program.get("record_type") or occurrence.get("record_type") or "note"),
        "occurred_at": occurred_at,
        "title": str(program.get("title") or occurrence.get("title") or "").strip() or None,
        "note": normalized.get("note"),
        "data": structured_data,
    }


async def async_record_care_result(
    storage: PuppyRecordStorage,
    program: dict[str, Any],
    occurrence: dict[str, Any],
    result: dict[str, Any],
    *,
    occurred_at: str | None = None,
) -> str:
    """Persist one care result through the existing dossier storage contract."""
    payload = care_result_record_payload(
        program,
        occurrence,
        result,
        occurred_at=occurred_at,
    )
    return await storage.async_add_record(
        payload["litter_id"],
        record_type=payload["record_type"],
        puppy_id=payload["puppy_id"],
        occurred_at=payload["occurred_at"],
        title=payload["title"],
        note=payload["note"],
        data=payload["data"],
    )
