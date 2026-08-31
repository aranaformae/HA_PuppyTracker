"""Integrity checks for reusable mother profiles and mother dossier records."""

from __future__ import annotations

from collections import Counter
from copy import deepcopy
from datetime import datetime
from typing import Any

from .records import RECORD_SCOPE_MOTHER, validate_record_type


def _valid_timestamp(value: Any) -> bool:
    if not isinstance(value, str) or not value:
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return False
    return parsed.tzinfo is not None


def inspect_mother_data(
    data: dict[str, Any],
    *,
    repair: bool,
) -> tuple[bool, dict[str, Any]]:
    """Inspect mother profiles and apply only unambiguous ownership repairs."""
    changed = False
    issue_counts: Counter[str] = Counter()
    repair_counts: Counter[str] = Counter()
    unresolved: list[dict[str, Any]] = []
    checked_mothers = 0
    checked_records = 0

    def issue(
        code: str,
        *,
        severity: str = "warning",
        repaired: bool = False,
        mother_id: str | None = None,
        litter_id: str | None = None,
        record_id: str | None = None,
    ) -> None:
        issue_counts[code] += 1
        if repaired:
            repair_counts[code] += 1
            return
        if len(unresolved) < 50:
            unresolved.append(
                {
                    "code": code,
                    "severity": severity,
                    "mother_id": mother_id,
                    "litter_id": litter_id,
                    "record_id": record_id,
                }
            )

    mothers = data.get("mothers", {})
    if not isinstance(mothers, dict):
        issue("invalid_mothers_container", severity="critical")
        mothers = {}

    litters = data.get("litters", {}) if isinstance(data.get("litters"), dict) else {}

    for mother_key, mother in mothers.items():
        mother_id = str(mother_key)
        if not isinstance(mother, dict):
            issue("invalid_mother_profile", severity="critical", mother_id=mother_id)
            continue
        checked_mothers += 1

        if mother.get("id") != mother_id:
            if repair:
                mother["id"] = mother_id
                changed = True
                issue("mother_id_mismatch", repaired=True, mother_id=mother_id)
            else:
                issue("mother_id_mismatch", severity="critical", mother_id=mother_id)

        if not str(mother.get("name") or "").strip():
            issue("missing_mother_name", severity="critical", mother_id=mother_id)

        records = mother.get("records", [])
        if not isinstance(records, list):
            issue("invalid_mother_records_container", severity="critical", mother_id=mother_id)
            continue

        valid_records = [item for item in records if isinstance(item, dict)]
        checked_records += len(valid_records)
        if len(valid_records) != len(records):
            issue("invalid_mother_record", severity="critical", mother_id=mother_id)

        ids = [item.get("id") for item in valid_records if item.get("id")]
        for record_id, count in Counter(ids).items():
            if count > 1:
                issue(
                    "duplicate_mother_record_id",
                    severity="critical",
                    mother_id=mother_id,
                    record_id=str(record_id),
                )

        for record in valid_records:
            record_id = str(record.get("id")) if record.get("id") else None
            litter_id = str(record.get("litter_id") or "") or None
            if not record_id:
                issue("missing_mother_record_id", severity="critical", mother_id=mother_id)

            try:
                validate_record_type(str(record.get("type") or ""))
            except ValueError:
                issue(
                    "invalid_mother_record_type",
                    severity="critical",
                    mother_id=mother_id,
                    litter_id=litter_id,
                    record_id=record_id,
                )

            ownership = {
                "scope": RECORD_SCOPE_MOTHER,
                "mother_id": mother_id,
                "puppy_id": None,
            }
            for field, expected in ownership.items():
                if record.get(field) == expected:
                    continue
                if repair:
                    record[field] = expected
                    changed = True
                    issue(
                        f"mother_record_{field}_mismatch",
                        repaired=True,
                        mother_id=mother_id,
                        litter_id=litter_id,
                        record_id=record_id,
                    )
                else:
                    issue(
                        f"mother_record_{field}_mismatch",
                        severity="critical",
                        mother_id=mother_id,
                        litter_id=litter_id,
                        record_id=record_id,
                    )

            if not litter_id or litter_id not in litters:
                issue(
                    "mother_record_unknown_litter",
                    severity="critical",
                    mother_id=mother_id,
                    litter_id=litter_id,
                    record_id=record_id,
                )
            elif str(litters[litter_id].get("mother_id") or "") != mother_id:
                issue(
                    "mother_record_litter_owner_mismatch",
                    severity="critical",
                    mother_id=mother_id,
                    litter_id=litter_id,
                    record_id=record_id,
                )

            for field in ("occurred_at", "created_at", "updated_at"):
                if not _valid_timestamp(record.get(field)):
                    issue(
                        f"invalid_mother_record_{field}",
                        severity="critical",
                        mother_id=mother_id,
                        litter_id=litter_id,
                        record_id=record_id,
                    )

            if not isinstance(record.get("data"), dict):
                issue(
                    "invalid_mother_record_data",
                    severity="critical",
                    mother_id=mother_id,
                    litter_id=litter_id,
                    record_id=record_id,
                )

    # A litter may point only to a known mother profile.
    for litter_id, litter in litters.items():
        if not isinstance(litter, dict):
            continue
        mother_id = litter.get("mother_id")
        if mother_id and str(mother_id) not in mothers:
            issue(
                "litter_unknown_mother",
                severity="critical",
                mother_id=str(mother_id),
                litter_id=str(litter_id),
            )

    critical = sum(1 for item in unresolved if item["severity"] == "critical")
    warnings = sum(1 for item in unresolved if item["severity"] != "critical")
    return changed, {
        "healthy": critical == 0,
        "issues_found": sum(issue_counts.values()),
        "repairs_applied": sum(repair_counts.values()),
        "unresolved_count": len(unresolved),
        "unresolved_critical": critical,
        "unresolved_warnings": warnings,
        "checked": {"mothers": checked_mothers, "mother_records": checked_records},
        "issue_counts": dict(issue_counts),
        "repair_counts": dict(repair_counts),
        "unresolved": unresolved,
    }


def merge_integrity_reports(base: dict[str, Any], mother: dict[str, Any]) -> dict[str, Any]:
    """Merge mother diagnostics into the existing storage integrity report."""
    merged = deepcopy(base)
    merged["healthy"] = bool(base.get("healthy", True) and mother.get("healthy", True))
    for key in (
        "issues_found",
        "repairs_applied",
        "unresolved_count",
        "unresolved_critical",
        "unresolved_warnings",
    ):
        merged[key] = int(base.get(key, 0)) + int(mother.get(key, 0))
    merged.setdefault("checked", {}).update(mother.get("checked", {}))
    for section in ("issue_counts", "repair_counts"):
        counter = Counter(base.get(section, {}))
        counter.update(mother.get(section, {}))
        merged[section] = dict(counter)
    merged["unresolved"] = list(base.get("unresolved", [])) + list(mother.get("unresolved", []))
    merged["unresolved"] = merged["unresolved"][:50]
    return merged
