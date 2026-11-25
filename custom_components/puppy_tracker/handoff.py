"""Puppy-owned departure planning; contacts and clinical records stay separate."""
from __future__ import annotations

from datetime import date, datetime, time
import re
from typing import Any

from homeassistant.util import dt as dt_util

from .records import create_record
from .time_utils import parse_timestamp

CHECKS = (
    "chip", "registration", "vaccination", "deworming", "puppy_test", "vet_check",
    "contract", "food", "passport", "report", "departure_weight",
)
MAX_CHECKLIST_ITEMS = 40
_ITEM_ID = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")
_ITEM_LABELS = {
    "nl": dict(zip(CHECKS, ("Chipnummer gecontroleerd", "Registratie geregeld", "Vaccinatie gecontroleerd", "Ontworming gecontroleerd", "Puppytest gecontroleerd", "Dierenartscontrole gecontroleerd", "Contract geregeld", "Voeding en uitleg meegegeven", "Paspoort klaar", "Dossier / rapport meegegeven", "Vertrekgewicht gecontroleerd"))),
    "en": dict(zip(CHECKS, ("Microchip number checked", "Registration arranged", "Vaccination checked", "Deworming checked", "Puppy test checked", "Vet check confirmed", "Contract arranged", "Food and instructions provided", "Passport ready", "Dossier / report provided", "Departure weight checked"))),
}


def normalize_checklist_items(value: Any) -> list[dict[str, Any]]:
    """Bound a nest's ordered checklist; IDs carry confirmations, never positions."""
    if not isinstance(value, list) or not 1 <= len(value) <= MAX_CHECKLIST_ITEMS:
        raise ValueError("A checklist needs 1 to 40 items")
    items, seen = [], set()
    for item in value:
        if not isinstance(item, dict) or set(item) != {"id", "label"}:
            raise ValueError("Invalid checklist item")
        key, label = item["id"], item["label"]
        if not isinstance(key, str) or not _ITEM_ID.fullmatch(key) or key in seen:
            raise ValueError("Checklist item IDs must be unique")
        if label is None:
            if key not in CHECKS:
                raise ValueError("Enter a checklist item label")
        elif not isinstance(label, str) or not label.strip() or len(label.strip()) > 160 or any(ord(c) < 32 for c in label):
            raise ValueError("Checklist labels need 1 to 160 printable characters")
        else:
            label = label.strip()
        seen.add(key)
        items.append({"id": key, "label": label})
    return items


def checklist_for_litter(litter: dict[str, Any]) -> dict[str, Any]:
    """An unconfigured nest starts with the translated standard checklist."""
    value = litter.get("handoff_checklist")
    if value is None:
        return {"revision": "default", "items": [{"id": key, "label": None} for key in CHECKS]}
    if not isinstance(value, dict) or set(value) != {"revision", "items"} or not isinstance(value["revision"], str) or not 1 <= len(value["revision"]) <= 80:
        raise ValueError("Invalid nest handoff checklist")
    return {"revision": value["revision"], "items": normalize_checklist_items(value["items"])}


def handoff_item_label(item: dict[str, Any], language: str) -> str:
    """Custom text stays as entered; unchanged defaults follow the PDF/UI language."""
    return item["label"] if item["label"] is not None else _ITEM_LABELS[language][item["id"]]


def checklist_view(checklist: dict[str, Any]) -> dict[str, Any]:
    return {"revision": checklist["revision"], "max_items": MAX_CHECKLIST_ITEMS,
            "items": [{**item, "labels": {lang: handoff_item_label(item, lang) for lang in ("nl", "en")}} for item in checklist["items"]]}


STAGES = ("available", "option", "reserved")


class HandoffConflict(ValueError):
    """A concurrent puppy edit must not be overwritten."""


def normalize_handoff(value: Any = None, *, items: list[dict[str, Any]]) -> dict[str, Any]:
    """Validate portable state without depending on current contacts or time."""
    if value is None:
        value = {}
    if not isinstance(value, dict) or set(value) - {"stage", "departure_date", "checks"}:
        raise ValueError("Invalid handoff data")
    stage = value.get("stage", "available")
    if stage not in STAGES:
        raise ValueError("Invalid handoff stage")
    departure = value.get("departure_date")
    if departure == "":
        departure = None
    if departure is not None:
        if not isinstance(departure, str):
            raise ValueError("Invalid departure date")
        try:
            if date.fromisoformat(departure).isoformat() != departure:
                raise ValueError
        except ValueError as err:
            raise ValueError("Invalid departure date") from err
    checks = value.get("checks", {})
    if not isinstance(checks, dict) or set(checks) - {item["id"] for item in items} or any(type(v) is not bool for v in checks.values()):
        raise ValueError("Invalid handoff checklist")
    return {"stage": stage, "departure_date": departure,
            "checks": {item["id"]: checks.get(item["id"], False) for item in items}}


def handoff_summary(puppy: dict[str, Any], litter: dict[str, Any]) -> dict[str, Any]:
    """Build a privacy-safe current view; assignment follows existing links."""
    checklist = checklist_for_litter(litter)
    state = normalize_handoff(puppy.get("handoff"), items=checklist["items"])
    missing = [item["id"] for item in checklist["items"] if not state["checks"][item["id"]]]
    return {**state,
            "status": "departed" if state["departure_date"] else "assigned" if puppy.get("owner_ids") else state["stage"],
            "assigned": bool(puppy.get("owner_ids")),
            "checklist": checklist_view(checklist),
            "completed_count": len(checklist["items"]) - len(missing), "total_count": len(checklist["items"]),
            "missing": missing, "ready": not missing}


def handoff_departure_record(
    litter_id: str, puppy_id: str, puppy: dict[str, Any],
) -> dict[str, Any] | None:
    """Derive one read-only milestone from the authoritative departure date."""
    departure = (puppy.get("handoff") or {}).get("departure_date")
    if not departure:
        return None
    local = datetime.combine(date.fromisoformat(departure), time(12), dt_util.DEFAULT_TIME_ZONE)
    record = create_record(litter_id=litter_id, puppy_id=puppy_id, record_type="milestone",
                           occurred_at=local.isoformat(), now=puppy.get("updated_at"),
                           data={})
    record.update(id=f"handoff:{puppy_id}", generated="handoff_departure")
    return record


def validate_departure(
    state: dict[str, Any], puppy: dict[str, Any], litter: dict[str, Any],
    *, confirm_incomplete: bool = False,
) -> None:
    """Validate a write; backups retain historical dates unchanged."""
    departure = state["departure_date"]
    if not departure:
        return
    day = date.fromisoformat(departure)
    birth = parse_timestamp(puppy.get("birth_time"))
    birth_day = dt_util.as_local(birth).date() if birth else date.fromisoformat(litter["birth_date"]) if litter.get("birth_date") else None
    if day > dt_util.now().date() or (birth_day and day < birth_day):
        raise ValueError("Departure date must be between birth and today")
    if not all(state["checks"].values()) and not confirm_incomplete:
        raise ValueError("Confirm departure with an incomplete checklist")
