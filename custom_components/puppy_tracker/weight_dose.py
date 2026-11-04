"""User-configured per-kg amounts; never infer a medical dose or another owner."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
import math
from typing import Any

from homeassistant.util import dt as dt_util

from .metrics import measurement_series
from .dog_identity import puppy_selector_label


def normalize_weight_dose(value: Any) -> dict | None:
    """Validate a user-supplied per-execution hint and weight freshness limit."""
    if value is None:
        return None
    if not isinstance(value, dict) or set(value) - {"amount_per_kg", "unit", "max_weight_age_hours"}:
        raise ValueError("Invalid weight-based amount settings")
    try:
        if isinstance(value.get("amount_per_kg"), bool) or isinstance(value.get("max_weight_age_hours"), bool):
            raise TypeError("Boolean values are not amounts")
        rate = float(value["amount_per_kg"])
        hours = float(value.get("max_weight_age_hours", 24))
    except (KeyError, ValueError, TypeError) as err:
        raise ValueError("Enter a positive amount per kg and maximum weight age in hours") from err
    unit = str(value.get("unit") or "").strip()
    if not math.isfinite(rate) or not 0 < rate <= 1_000_000:
        raise ValueError("Amount per kg must be positive and finite")
    if not math.isfinite(hours) or not 0 < hours <= 8760:
        raise ValueError("Maximum weight age must be between 0 and 8760 hours")
    if not unit or len(unit) > 32 or any(ord(char) < 32 for char in unit):
        raise ValueError("Enter a unit of at most 32 characters")
    return {"amount_per_kg": rate, "unit": unit, "max_weight_age_hours": hours}


def calculate_weight_dose(storage, config: dict | None, litter_id: str, scope: str,
                          owner_id: str, *, now: datetime | None = None) -> dict | None:
    """Use the latest active positive non-future weight of exactly this puppy."""
    config = normalize_weight_dose(config)
    if config is None:
        return None
    current = dt_util.as_utc(now or dt_util.now())
    base = {**config, "status": "missing_weight", "amount": None, "weight_grams": None,
            "weight_timestamp": None, "measurement_id": None, "weight_age_hours": None}
    if scope == "litter":
        litter = storage.get_litter(litter_id) or {}
        return {**base, "status": "per_puppy", "items": [
            {"puppy_id": puppy_id, "puppy_label": puppy_selector_label(puppy),
             "dose": calculate_weight_dose(storage, config, litter_id, "puppy", puppy_id, now=current)}
            for puppy_id, puppy in litter.get("puppies", {}).items() if puppy.get("active", True)]}
    if scope != "puppy":
        # Mother profiles currently have no canonical weighing history. Never use
        # a litter aggregate, another puppy or an untracked free-text weight.
        return {**base, "status": "individual_weight_unavailable"}
    if not storage.get_puppy(litter_id, owner_id):
        return base
    samples = [(stamp, row) for stamp, row in measurement_series(storage, litter_id, owner_id)
               if stamp <= current and math.isfinite(float(row["weight"])) and float(row["weight"]) > 0]
    if not samples:
        return base
    stamp, row = samples[-1]
    grams = float(row["weight"])
    age = (current - dt_util.as_utc(stamp)).total_seconds() / 3600
    amount = float(Decimal(str(grams)) / Decimal(1000) * Decimal(str(config["amount_per_kg"])))
    if not math.isfinite(amount):
        return base
    return {**base, "status": "stale_weight" if age > config["max_weight_age_hours"] else "ready",
            "amount": amount, "weight_grams": grams, "weight_timestamp": dt_util.as_utc(stamp).isoformat(),
            "measurement_id": row.get("id"), "weight_age_hours": age}


def dose_for_occurrence(storage, occurrence: dict) -> dict:
    if occurrence.get("weight_dose") is not None:
        return {**occurrence, "dose": calculate_weight_dose(storage, occurrence["weight_dose"],
            occurrence["litter_id"], "puppy", occurrence["puppy_id"])}
    return occurrence


def dose_fingerprint(dose: dict | None) -> tuple | None:
    """Exclude continuously increasing age to avoid repeated notification sends."""
    if dose and dose.get("status") == "per_puppy":
        return tuple((item["puppy_id"], dose_fingerprint(item["dose"])) for item in dose["items"])
    return tuple(dose.get(key) for key in ("measurement_id", "weight_timestamp", "amount", "unit", "status", "amount_per_kg", "max_weight_age_hours")) if dose else None


def dose_notice(dose: dict | None, language: str = "nl") -> str:
    if not dose:
        return ""
    english = language == "en"
    if dose.get("status") == "per_puppy":
        return "\n".join(item["puppy_label"] + ": " + dose_notice(item["dose"], language) for item in dose["items"]) or (
            "No active puppies for an individual calculation." if english else "Geen actieve pups voor een individuele berekening.")
    if dose["amount"] is None:
        return "AMOUNT UNAVAILABLE: no individual weight known." if english else "HOEVEELHEID ONBEKEND: geen individueel gewicht bekend."
    amount = format(dose["amount"], ".6g")
    kilograms = format(dose["weight_grams"] / 1000, ".6g")
    age = format(dose["weight_age_hours"], ".3g")
    maximum = format(dose["max_weight_age_hours"], ".3g")
    if not english:
        amount, kilograms, age, maximum = (value.replace(".", ",") for value in (amount, kilograms, age, maximum))
    text = (f"Calculated amount: {amount} {dose['unit']} ({kilograms} kg; weight {age} h old)." if english
            else f"Berekende hoeveelheid: {amount} {dose['unit']} ({kilograms} kg; gewicht {age} uur oud).")
    if dose["status"] == "stale_weight":
        text += (f" WARNING: WEIGHT TOO OLD (maximum {maximum} h). Check before use." if english
                 else f" LET OP: GEWICHT TE OUD (maximaal {maximum} uur). Controleer voor gebruik.")
    return text
