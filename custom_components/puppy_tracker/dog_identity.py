"""Shared contract identity helpers for puppies and parent dogs."""

from __future__ import annotations

from datetime import date
from typing import Any


DEFAULT_DOG_BREED = "Multi-generation Australian Labradoodle"
PARENT_IDENTITY_FIELDS = (
    "registered_name", "birth_date", "breed", "wala_number", "chip_number"
)

_MISSING = object()


def optional_text(value: Any) -> str | None:
    """Return trimmed optional text."""
    text = str(value or "").strip()
    return text or None


def optional_date(value: Any, *, field: str = "birth_date") -> str | None:
    """Return an ISO date or raise for invalid contract data."""
    text = optional_text(value)
    if text is None:
        return None
    try:
        date.fromisoformat(text)
    except ValueError as err:
        raise ValueError(f"{field} must be an ISO date") from err
    return text


def normalize_parent_details(
    value: Any,
    *,
    call_name: Any = _MISSING,
) -> dict[str, str | None]:
    """Normalize one parent identity while keeping call name explicit."""
    source = value if isinstance(value, dict) else {}
    source_call_name = source.get("call_name", source.get("name"))
    normalized_call_name = optional_text(
        source_call_name if call_name is _MISSING else call_name
    )
    return {
        "registered_name": optional_text(source.get("registered_name")),
        "call_name": normalized_call_name,
        "birth_date": optional_date(source.get("birth_date")),
        "breed": optional_text(source.get("breed")) or DEFAULT_DOG_BREED,
        "wala_number": optional_text(source.get("wala_number")),
        "chip_number": optional_text(source.get("chip_number")),
    }


def parent_details_for_litter(
    data: dict[str, Any],
    litter: dict[str, Any],
    role: str,
) -> dict[str, str | None]:
    """Resolve a normalized mother or father identity for one litter."""
    if role not in {"mother", "father"}:
        raise ValueError("role must be mother or father")

    if role == "mother":
        mother_id = str(litter.get("mother_id") or "")
        source = data.get("mothers", {}).get(mother_id, {})
        if not isinstance(source, dict):
            source = {}
    else:
        source = litter.get("father_details")

    return normalize_parent_details(source, call_name=litter.get(role))


def migrate_contract_identity_data(data: dict[str, Any]) -> bool:
    """Add contract identity fields to existing litter and puppy records."""
    changed = False
    litters = data.get("litters", {})
    if not isinstance(litters, dict):
        return False

    for litter in litters.values():
        if not isinstance(litter, dict):
            continue

        father_details = normalize_parent_details(
            litter.get("father_details"),
            call_name=litter.get("father"),
        )
        if litter.get("father_details") != father_details:
            litter["father_details"] = father_details
            changed = True

        puppies = litter.get("puppies", {})
        if not isinstance(puppies, dict):
            continue
        for puppy in puppies.values():
            if not isinstance(puppy, dict):
                continue
            defaults = {
                "registered_name": optional_text(puppy.get("registered_name")),
                "coat_color": optional_text(puppy.get("coat_color")),
                "breed": optional_text(puppy.get("breed")) or DEFAULT_DOG_BREED,
            }
            for field, value in defaults.items():
                if field not in puppy or puppy.get(field) != value:
                    puppy[field] = value
                    changed = True

    return changed
