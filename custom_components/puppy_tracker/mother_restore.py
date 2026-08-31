"""Plan safe mother dossier imports without mutating storage."""

from __future__ import annotations

from typing import Any

MOTHER_IMPORT_MERGE = "merge_existing"
MOTHER_IMPORT_NEW = "new_profile"
MOTHER_IMPORT_MODES = frozenset({MOTHER_IMPORT_MERGE, MOTHER_IMPORT_NEW})
DEFAULT_MOTHER_IMPORT_MODE = MOTHER_IMPORT_MERGE


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
