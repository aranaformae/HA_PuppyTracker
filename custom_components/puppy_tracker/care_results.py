"""Convert age-based care occurrence results into canonical puppy dossier records."""

from __future__ import annotations

from copy import deepcopy
from typing import Any, Protocol

CARE_RESULT_STATUSES = {"completed", "missed"}


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
    return normalized


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
        "care_age_days": int(occurrence.get("age_days") or 0),
        "care_scheduled_at": occurrence.get("scheduled_at"),
        "care_status": normalized["status"],
        "care_result": normalized.get("result"),
        "care_score": normalized.get("score"),
        "care_data": normalized.get("data", {}),
    }

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
