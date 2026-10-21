"""Dependency-free PDF report generation for Puppy Tracker."""

from __future__ import annotations

import base64
import colorsys
import json
import math
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from homeassistant.util import dt as dt_util

from .behavior import BEHAVIOR_GROUPS, BEHAVIOR_RECORD_TYPE, build_behavior_profile
from .dog_identity import parent_details_for_litter
from .measurements import puppy_measurements
from .metrics import calculate_puppy_metrics
from .owners import final_payment_amount, owner_address_parts
from .storage import PuppyTrackerStorage
from .time_utils import format_local_timestamp, timestamp_sort_key

PAGE_WIDTH = 595.28
PAGE_HEIGHT = 841.89
MARGIN = 42.0
CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
LOGO_PATH = Path(__file__).parent / "brand" / "logo.jpg"

_COLLAR_COLOR_GROUPS = (
    (("lichtblauw", "lightblue", "skyblue"), "#42a5f5"),
    (("donkerblauw", "darkblue", "navy"), "#1565c0"),
    (("blauw", "blue"), "#1e88e5"),
    (("lichtroze", "lightpink"), "#f48fb1"),
    (("donkerroze", "darkpink"), "#d81b60"),
    (("roze", "pink"), "#ec407a"),
    (("lichtgroen", "lightgreen", "lime"), "#7cb342"),
    (("donkergroen", "darkgreen"), "#2e7d32"),
    (("groen", "green"), "#43a047"),
    (("rood", "red"), "#e53935"),
    (("geel", "yellow"), "#f9a825"),
    (("paars", "purple", "violet"), "#8e24aa"),
    (("oranje", "orange"), "#fb8c00"),
    (("turquoise", "turkoois", "cyan", "aqua"), "#00acc1"),
    (("bruin", "brown"), "#795548"),
    (("grijs", "gray", "grey", "zilver", "silver"), "#78909c"),
    (("zwart", "black"), "#424242"),
    (("wit", "white"), "#b0bec5"),
)

_OWNER_ROLE_LABELS = {
    "owner": "Eigenaar",
    "co_owner": "Mede-eigenaar",
    "breeder": "Fokker",
    "veterinarian": "Dierenarts",
    "contact": "Contactpersoon",
}
_PLACEMENT_STATUS_LABELS = {
    "interested": "Interesse",
    "option": "Optie",
    "reserved": "Gereserveerd",
    "sold": "Verkocht",
    "placed": "Geplaatst",
}
_PAYMENT_STATUS_LABELS = {
    "none": "Geen",
    "registration_fee": "Inschrijfgeld",
    "deposit": "Aanbetaling",
    "full": "Volledig betaald",
}
_PAYMENT_METHOD_LABELS = {
    "none": "Niet opgegeven",
    "bank_transfer": "Bankoverschrijving",
    "cash": "Contant",
    "card": "Kaart",
    "other": "Overig",
}

_PDF_LABELS = {
    "nl": {
        "litter": "Nest", "mother": "Moeder", "father": "Vader", "puppies": "Pups",
        "generated": "gegenereerd", "full_history": "Volledige historie", "last_24h": "Laatste 24 uur",
        "last_days": "Laatste {value} dagen", "last_hours": "Laatste {value} uur",
        "owners": "Baasjegegevens", "no_owners": "Geen gekoppelde baasjes voor de pups in dit rapport.",
        "puppy": "Pup", "owner": "Baasje", "role": "Rol", "placement": "Plaatsing",
        "payment": "Betaling", "contact": "Contactgegevens", "amount": "Totaalbedrag",
        "registration_fee": "Inschrijfgeld", "deposit": "Aanbetaling",
        "final_payment": "Slotbetaling", "balance": "Werkelijk open",
        "placement_date": "Geplaatst", "expected_pickup": "Verwacht ophalen",
        "deposit_date": "Aanbetaling op", "paid": "Slotbetaling op",
        "email": "E-mail", "phone": "Tel", "street": "Straat en huisnummer",
        "postal_code": "Postcode", "city": "Plaats",
        "attention": "Actuele aandachtspunten", "no_attention": "Actuele status: geen actieve waarschuwingen voor de pups in dit rapport.",
        "summary": "Samenvatting", "collar": "Band", "sex": "Gesl.", "female": "Teef",
        "male": "Reu", "birth": "Geboorte", "current": "Huidig", "growth_24h": "Groei 24u",
        "total": "Totaal", "status": "Status", "weight_chart": "Gewichtsontwikkeling",
        "no_chart": "Geen geldige metingen voor een grafiek in deze periode.",
        "chip": "Chip", "born": "Geboren", "birth_weight": "Geboortegewicht",
        "identity_details": "Identiteitsgegevens", "parent_details": "Oudergegevens",
        "profile_note": "Profielnotitie",
        "registered_name": "Naam", "puppy_registered_name": "Nestnaam", "call_name": "Roepnaam", "birth_date": "Geboortedatum",
        "coat_color": "Vachtkleur", "breed": "Soort", "wala": "WALA", "parent": "Ouder", "value": "Waarde",
        "date_time": "Datum/tijd", "weight": "Gewicht", "difference": "Verschil", "type": "Type",
        "note": "Notitie", "weighing": "weging", "no_measurements": "Geen geldige metingen in deze periode.",
        "care": "Zorgprogrammaresultaten", "care_action": "Zorgactie", "day": "Dag",
        "result": "Resultaat", "score": "Score", "instruction": "Dag-instructie",
        "completed": "Uitgevoerd", "missed": "Gemist",
        "no_care": "Geen zorgprogrammaresultaten in deze periode.",
        "dossier": "Dossieritems", "no_dossier": "Geen dossieritems met deze filters in deze periode.",
        "behavior": "Gedragsprofiel", "no_behavior": "Geen gedragsobservaties in deze periode.",
        "behavior_final": "Eindscore zichtbaarheid", "behavior_sessions": "Meetmomenten",
        "behavior_criteria": "Criteria gescoord", "behavior_observations": "Oefeningen en observaties",
        "behavior_traits": "Karaktereigenschappen", "behavior_average": "Gemiddelde",
        "behavior_latest": "Laatste", "behavior_count": "Aantal", "behavior_observer": "Observator / context",
        "behavior_age": "Leeftijd (dagen)", "behavior_note": "Een hogere score betekent dat een kenmerk duidelijker zichtbaar was; dit is geen goed/fout-oordeel.",
        "source": "Bron", "litter_source": "Hele nest", "puppy_source": "Pup",
        "details": "Gegevens", "yes": "Ja", "no": "Nee", "unknown": "Onbekend",
        "disclaimer": "Gegenereerd door Puppy Tracker. Monitoringwaarden zijn bedoeld als hulpmiddel bij het volgen van groei en vervangen geen veterinaire beoordeling.",
    },
    "en": {
        "litter": "Litter", "mother": "Mother", "father": "Father", "puppies": "Puppies",
        "generated": "generated", "full_history": "Full history", "last_24h": "Last 24 hours",
        "last_days": "Last {value} days", "last_hours": "Last {value} hours",
        "owners": "Owner details", "no_owners": "No owners linked to the puppies in this report.",
        "puppy": "Puppy", "owner": "Owner", "role": "Role", "placement": "Placement",
        "payment": "Payment", "contact": "Contact details", "amount": "Total amount",
        "registration_fee": "Registration fee", "deposit": "Deposit",
        "final_payment": "Final payment", "balance": "Actual outstanding",
        "placement_date": "Placed", "expected_pickup": "Expected pickup",
        "deposit_date": "Deposit date", "paid": "Final payment date",
        "email": "Email", "phone": "Phone", "street": "Street and house number",
        "postal_code": "Postal code", "city": "City",
        "attention": "Current weight alerts", "no_attention": "Current status: no active weight alerts for the puppies in this report.",
        "summary": "Summary", "collar": "Collar", "sex": "Sex", "female": "Female",
        "male": "Male", "birth": "Birth", "current": "Current", "growth_24h": "Growth 24h",
        "total": "Total", "status": "Status", "weight_chart": "Weight development",
        "no_chart": "No valid measurements for a chart in this period.",
        "chip": "Chip", "born": "Born", "birth_weight": "Birth weight",
        "identity_details": "Identity details", "parent_details": "Parent details",
        "profile_note": "Profile note",
        "registered_name": "Registered name", "puppy_registered_name": "Registered name", "call_name": "Call name", "birth_date": "Birth date",
        "coat_color": "Coat color", "breed": "Breed / type", "wala": "WALA", "parent": "Parent", "value": "Value",
        "date_time": "Date/time", "weight": "Weight", "difference": "Change", "type": "Type",
        "note": "Note", "weighing": "weighing", "no_measurements": "No valid measurements in this period.",
        "care": "Care program results", "care_action": "Care action", "day": "Day",
        "result": "Result", "score": "Score", "instruction": "Daily instruction",
        "completed": "Completed", "missed": "Missed",
        "no_care": "No care program results in this period.",
        "dossier": "Dossier items", "no_dossier": "No dossier items match these filters in this period.",
        "behavior": "Behavior profile", "no_behavior": "No behavior observations in this period.",
        "behavior_final": "Final visibility score", "behavior_sessions": "Sessions",
        "behavior_criteria": "Criteria scored", "behavior_observations": "Exercises and observations",
        "behavior_traits": "Character traits", "behavior_average": "Average",
        "behavior_latest": "Latest", "behavior_count": "Count", "behavior_observer": "Observer / context",
        "behavior_age": "Age (days)", "behavior_note": "A higher score means a trait was more clearly visible; it is not a good/bad judgement.",
        "source": "Source", "litter_source": "Whole litter", "puppy_source": "Puppy",
        "details": "Details", "yes": "Yes", "no": "No", "unknown": "Unknown",
        "disclaimer": "Generated by Puppy Tracker. Monitoring values help track growth and do not replace veterinary assessment.",
    },
}

_PDF_ENUMS = {
    "en": {
        "role": {"owner": "Owner", "co_owner": "Co-owner", "breeder": "Breeder", "veterinarian": "Veterinarian", "contact": "Contact person"},
        "placement": {"interested": "Interested", "option": "Option", "reserved": "Reserved", "sold": "Sold", "placed": "Placed"},
        "payment": {"none": "None", "registration_fee": "Registration fee", "deposit": "Deposit", "full": "Paid in full"},
        "method": {"none": "Not specified", "bank_transfer": "Bank transfer", "cash": "Cash", "card": "Card", "other": "Other"},
    },
    "nl": {"role": _OWNER_ROLE_LABELS, "placement": _PLACEMENT_STATUS_LABELS,
           "payment": _PAYMENT_STATUS_LABELS, "method": _PAYMENT_METHOD_LABELS},
}

_PDF_RECORD_TYPES = {
    "nl": {"note": "Notitie", "feeding": "Voeding", "temperature": "Temperatuur", "vaccination": "Vaccinatie", "test": "Test / uitslag", "deworming": "Ontworming", "medication": "Medicatie", "vet_visit": "Dierenartsbezoek", "milestone": "Mijlpaal", "behavior_observation": "Gedragsobservatie", "other": "Overig"},
    "en": {"note": "Note", "feeding": "Feeding", "temperature": "Temperature", "vaccination": "Vaccination", "test": "Test / result", "deworming": "Deworming", "medication": "Medication", "vet_visit": "Vet visit", "milestone": "Milestone", "behavior_observation": "Behavior observation", "other": "Other"},
}

_BEHAVIOR_LABELS = {
    "nl": {
        "pick_up_hold": "Oppakken en vasthouden", "hold_upright": "Rechtop houden",
        "hold_on_back": "Op de rug houden", "paw_stimulation": "Voetzoolprikkel",
        "cold_surface": "Koude ondergrond", "stimulus_recovery": "Herstelsnelheid na prikkel",
        "sound_sensitivity": "Geluidsgevoeligheid", "curiosity": "Nieuwsgierigheid",
        "confidence": "Zelfvertrouwen", "persistence": "Doorzettingsvermogen",
        "human_orientation": "Mensgerichtheid (contact zoeken)", "settle_after_stimulus": "Rust kunnen terugvinden",
        "gentle": "Zacht", "bold": "Stoer", "calm": "Rustig", "spirited": "Pittig",
        "people_focused": "Mensgericht", "independent": "Zelfstandig", "sensitive": "Gevoelig",
        "enterprising": "Ondernemend", "cooperative": "Meegaand", "strong_willed": "Eigenwijs",
    },
    "en": {
        "pick_up_hold": "Pick up and hold", "hold_upright": "Hold upright",
        "hold_on_back": "Hold on back", "paw_stimulation": "Paw stimulation",
        "cold_surface": "Cold surface", "stimulus_recovery": "Recovery after stimulus",
        "sound_sensitivity": "Sound sensitivity", "curiosity": "Curiosity",
        "confidence": "Confidence", "persistence": "Persistence",
        "human_orientation": "Human orientation (seeking contact)", "settle_after_stimulus": "Settle after stimulus",
        "gentle": "Gentle", "bold": "Bold", "calm": "Calm", "spirited": "Spirited",
        "people_focused": "People-focused", "independent": "Independent", "sensitive": "Sensitive",
        "enterprising": "Enterprising", "cooperative": "Cooperative", "strong_willed": "Strong-willed",
    },
}

_PDF_DATA_LABELS = {
    "nl": {
        "temperature": "Temperatuur", "temperature_c": "Temperatuur (°C)",
        "method": "Methode", "observation": "Observatie", "feeding_type": "Voeding / soort",
        "amount": "Hoeveelheid", "unit": "Eenheid", "vaccine": "Vaccin",
        "vaccine_type": "Vaccintype", "batch_number": "Batchnummer",
        "veterinarian": "Dierenarts", "clinic": "Praktijk / kliniek",
        "reaction": "Reactie", "weight_grams": "Gewicht bij toediening (g)",
        "next_due_date": "Volgende datum", "test_name": "Testnaam",
        "result": "Resultaat", "laboratory": "Laboratorium", "product": "Product",
        "active_ingredient": "Werkzame stof", "dose": "Dosering", "route": "Toedieningsweg",
        "administered_by": "Toegediend door", "medication": "Medicatie",
        "frequency": "Frequentie", "duration": "Duur", "reason": "Reden bezoek",
        "diagnosis": "Diagnose", "treatment": "Behandeling", "milestone": "Mijlpaal",
        "category": "Categorie",
    },
    "en": {
        "temperature": "Temperature", "temperature_c": "Temperature (°C)",
        "method": "Method", "observation": "Observation", "feeding_type": "Food / feeding type",
        "amount": "Amount", "unit": "Unit", "vaccine": "Vaccine",
        "vaccine_type": "Vaccine type", "batch_number": "Batch number",
        "veterinarian": "Veterinarian", "clinic": "Clinic",
        "reaction": "Reaction", "weight_grams": "Weight at administration (g)",
        "next_due_date": "Next due date", "test_name": "Test name",
        "result": "Result", "laboratory": "Laboratory", "product": "Product",
        "active_ingredient": "Active ingredient", "dose": "Dose", "route": "Route",
        "administered_by": "Administered by", "medication": "Medication",
        "frequency": "Frequency", "duration": "Duration", "reason": "Visit reason",
        "diagnosis": "Diagnosis", "treatment": "Treatment", "milestone": "Milestone",
        "category": "Category",
    },
}

_INTERNAL_RECORD_KEYS = frozenset({
    "care_program_id", "care_program_revision", "care_occurrence_id",
    "reference_id", "reference_type", "source_id", "source_type",
    "followup_record_id", "followup_due_date",
    "recurring_reminder_id", "recurring_due_at", "recurring_scheduled_at", "recurring_completion",
})


def _pdf_text(language: str, key: str, **values: Any) -> str:
    return _PDF_LABELS[language][key].format(**values)


def _hex_rgb(value: str) -> tuple[float, float, float]:
    text = value.lstrip("#")
    if len(text) == 3:
        text = "".join(character * 2 for character in text)
    if len(text) != 6:
        raise ValueError("Invalid RGB color")
    return tuple(int(text[position : position + 2], 16) / 255 for position in (0, 2, 4))


def _compact_color_name(value: Any) -> str:
    text = unicodedata.normalize("NFD", str(value or "").strip().lower())
    text = "".join(character for character in text if not unicodedata.combining(character))
    text = re.sub(r"[^a-z0-9#(),.%\s-]", "", text)
    return re.sub(r"[\s_-]+", "", text)


def _collar_rgb(value: Any, index: int) -> tuple[float, float, float]:
    """Mirror the dashboard collar palette for PDF charts."""
    text = str(value or "").strip().lower()
    compact = _compact_color_name(text)
    for aliases, color in _COLLAR_COLOR_GROUPS:
        if any(compact == _compact_color_name(alias) for alias in aliases):
            return _hex_rgb(color)
    for aliases, color in _COLLAR_COLOR_GROUPS:
        if any(_compact_color_name(alias) in compact for alias in aliases):
            return _hex_rgb(color)
    if text.startswith("#"):
        try:
            return _hex_rgb(text)
        except ValueError:
            pass
    rgb_match = re.fullmatch(
        r"rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)",
        text,
    )
    if rgb_match:
        channels = tuple(min(255, int(channel)) / 255 for channel in rgb_match.groups())
        return channels
    hue = ((index * 63) + 205) % 360
    return colorsys.hls_to_rgb(hue / 360, 0.52, 0.68)


def _display_enum(value: Any, labels: dict[str, str], fallback: str) -> str:
    text = str(value or fallback)
    return labels.get(text, text)


def _safe_filename(value: str | None) -> str:
    text = (value or "nest").strip().lower()
    text = re.sub(r"[^a-z0-9_-]+", "-", text)
    return text.strip("-") or "nest"


def _active_measurements(
    puppy: dict[str, Any],
    range_hours: float | None = None,
) -> list[dict[str, Any]]:
    """Return effective measurements in canonical chronological order."""
    rows = puppy_measurements(puppy, active_only=True)
    if range_hours is None or range_hours <= 0:
        return rows

    cutoff = dt_util.now().timestamp() - float(range_hours) * 3600
    return [
        measurement
        for measurement in rows
        if timestamp_sort_key(measurement.get("timestamp")) >= cutoff
    ]


def _active_care_records(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
    range_hours: float | None = None,
) -> list[dict[str, Any]]:
    """Return canonical care-result dossier records in chronological order."""
    records = [
        record
        for record in storage.get_records(litter_id, puppy_id, newest_first=False)
        if isinstance(record.get("data"), dict)
        and record["data"].get("care_occurrence_id")
    ]
    if range_hours is None or range_hours <= 0:
        return records

    cutoff = dt_util.now().timestamp() - float(range_hours) * 3600
    return [
        record
        for record in records
        if timestamp_sort_key(record.get("occurred_at")) >= cutoff
    ]


def _format_local_datetime(value: str | None, language: str = "nl") -> str:
    return format_local_timestamp(value, "%Y-%m-%d %H:%M" if language == "en" else "%d-%m-%Y %H:%M")


def _format_date(value: Any, language: str = "nl") -> str:
    """Format an ISO date or timestamp without inventing a time."""
    text = str(value or "").strip()
    if not text:
        return "—"
    match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", text)
    if not match:
        return text
    year, month, day = match.groups()
    return f"{year}-{month}-{day}" if language == "en" else f"{day}-{month}-{year}"


def _format_weight(value: Any, language: str = "nl") -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return "—"
    if math.isclose(number, round(number), abs_tol=1e-9):
        return f"{int(round(number))} g"
    return f"{number:.1f} g".replace(".", ",") if language == "nl" else f"{number:.1f} g"


def _format_signed_weight(value: float | None, language: str = "nl") -> str:
    if value is None:
        return "—"
    prefix = "+" if value > 0 else "" if value == 0 else "-"
    result = f"{prefix}{abs(value):.1f} g".replace(".0 g", " g")
    return result.replace(".", ",") if language == "nl" else result


def _format_percent(value: float | None, language: str = "nl") -> str:
    if value is None:
        return "—"
    prefix = "+" if value > 0 else "" if value == 0 else "-"
    result = f"{prefix}{abs(value):.2f}%".replace(".00%", "%")
    return result.replace(".", ",") if language == "nl" else result


def _period_label(range_hours: float | None, language: str = "nl") -> str:
    if range_hours is None or range_hours <= 0:
        return _pdf_text(language, "full_history")
    hours = float(range_hours)
    if math.isclose(hours, 24, abs_tol=1e-9):
        return _pdf_text(language, "last_24h")
    days = hours / 24
    if hours > 24 and math.isclose(days, round(days), abs_tol=1e-9):
        return _pdf_text(language, "last_days", value=int(round(days)))
    return _pdf_text(language, "last_hours", value=f"{hours:g}")


def _status_label(metrics: dict[str, Any], language: str) -> str:
    if language == "nl":
        return str(metrics.get("status") or _pdf_text(language, "unknown"))
    codes = {
        "no_measurement": "No measurement", "weigh_due": "Weighing due",
        "first_day_excess_weight_loss": "Excess weight loss in first day",
        "first_24h": "First 24 hours", "weight_loss": "Weight loss",
        "low_growth": "Low growth", "ok": "On track", "insufficient_data": "Insufficient data",
        "stale": "Weighing overdue", "loss": "Weight loss", "below_threshold": "Below litter threshold",
        "on_track": "Within litter setting", "possible_input_error": "Possible input error",
        "sustained_weight_loss": "Sustained weight loss", "sustained_low_growth": "Sustained low growth",
    }
    return codes.get(str(metrics.get("status_code") or ""), _pdf_text(language, "unknown"))


def _record_data_text(record: dict[str, Any], language: str) -> str:
    data = record.get("data")
    if not isinstance(data, dict):
        return ""
    parts = []
    for key, value in data.items():
        if key in _INTERNAL_RECORD_KEYS or value in (None, ""):
            continue
        label = _PDF_DATA_LABELS[language].get(key, key.replace("_", " ").capitalize())
        if isinstance(value, bool):
            display = _pdf_text(language, "yes" if value else "no")
        elif isinstance(value, (dict, list)):
            display = json.dumps(value, ensure_ascii=False, sort_keys=True)
        else:
            display = str(value)
        parts.append(f"{label}: {display}")
    return " · ".join(parts)


def _dossier_records(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str | None,
    range_hours: float | None,
    dossier_types: list[str] | None,
) -> list[dict[str, Any]]:
    cutoff = dt_util.now().timestamp() - float(range_hours) * 3600 if range_hours and range_hours > 0 else None
    return [
        record for record in storage.get_records(litter_id, puppy_id, newest_first=False)
        if not (isinstance(record.get("data"), dict) and record["data"].get("care_occurrence_id"))
        and record.get("type") != BEHAVIOR_RECORD_TYPE
        and (dossier_types is None or record.get("type") in dossier_types)
        and (cutoff is None or timestamp_sort_key(record.get("occurred_at")) >= cutoff)
    ]


def _behavior_records(
    storage: PuppyTrackerStorage,
    litter_id: str,
    puppy_id: str,
    range_hours: float | None,
) -> list[dict[str, Any]]:
    """Return active behavior observations in the selected report period."""
    cutoff = dt_util.now().timestamp() - float(range_hours) * 3600 if range_hours and range_hours > 0 else None
    return [
        record
        for record in storage.get_records(litter_id, puppy_id, newest_first=False)
        if record.get("type") == BEHAVIOR_RECORD_TYPE
        and (cutoff is None or timestamp_sort_key(record.get("occurred_at")) >= cutoff)
    ]


def _format_care_score(value: Any, language: str = "nl") -> str:
    if value in (None, ""):
        return "—"
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    if math.isclose(number, round(number), abs_tol=1e-9):
        return str(int(round(number)))
    result = f"{number:.2f}".rstrip("0").rstrip(".")
    return result.replace(".", ",") if language == "nl" else result


def _care_result_text(data: dict[str, Any]) -> str:
    parts: list[str] = []
    result = data.get("care_result")
    if result not in (None, ""):
        parts.append(str(result))
    extra = data.get("care_data")
    if isinstance(extra, dict):
        parts.extend(f"{key}: {value}" for key, value in extra.items() if value not in (None, ""))
    return " · ".join(parts) or "—"


def _pdf_literal(text: str) -> bytes:
    raw = str(text).encode("cp1252", errors="replace")
    out = bytearray(b"(")
    for byte in raw:
        if byte in (0x28, 0x29, 0x5C):
            out.extend(b"\\" + bytes([byte]))
        elif 32 <= byte <= 126:
            out.append(byte)
        else:
            out.extend(f"\\{byte:03o}".encode("ascii"))
    out.extend(b")")
    return bytes(out)


def _estimate_width(text: str, size: float, bold: bool = False) -> float:
    factor = 0.54 if bold else 0.50
    return len(str(text)) * size * factor


def _jpeg_dimensions(data: bytes) -> tuple[int, int]:
    """Read JPEG dimensions without adding an image dependency."""
    if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
        raise ValueError("Invalid logo JPEG")
    index = 2
    while index + 9 < len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        index += 2
        if marker in (0xD8, 0xD9):
            continue
        length = int.from_bytes(data[index:index + 2], "big")
        if length < 2 or index + length > len(data):
            raise ValueError("Invalid logo JPEG")
        if 0xC0 <= marker <= 0xC3:
            if marker not in (0xC0, 0xC2) or length < 17 or data[index + 2] != 8 or data[index + 7] != 3:
                raise ValueError("Logo must be an 8-bit RGB JPEG")
            width = int.from_bytes(data[index + 5:index + 7], "big")
            height = int.from_bytes(data[index + 3:index + 5], "big")
            if not 0 < width <= 2048 or not 0 < height <= 2048:
                raise ValueError("Logo dimensions exceed limits")
            return width, height
        index += length
    raise ValueError("Invalid logo JPEG")


def _report_logo(encoded: str | None) -> bytes | None:
    """Accept bounded inline image bytes only; never read caller paths or URLs."""
    if isinstance(encoded, str) and len(encoded) <= 700_000:
        try:
            logo = base64.b64decode(encoded, validate=True)
            if len(logo) > 512_000:
                raise ValueError("Logo exceeds byte limit")
            _jpeg_dimensions(logo)
            return logo
        except ValueError:
            pass
    return LOGO_PATH.read_bytes() if LOGO_PATH.is_file() else None


def _wrap(text: str, size: float, width: float, bold: bool = False) -> list[str]:
    words = str(text or "").split()
    if not words:
        return [""]
    factor = 0.54 if bold else 0.50
    max_characters = max(1, int(width / max(size * factor, 0.1)))
    wrapped_words = [
        chunk
        for word in words
        for chunk in (
            [word]
            if _estimate_width(word, size, bold) <= width
            else [
                word[index : index + max_characters]
                for index in range(0, len(word), max_characters)
            ]
        )
    ]
    lines: list[str] = []
    current = wrapped_words[0]
    for word in wrapped_words[1:]:
        candidate = f"{current} {word}"
        if _estimate_width(candidate, size, bold) <= width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


@dataclass
class _TextBlock:
    lines: list[str]
    size: float
    spacing: float
    bold: bool = False
    indent: float = 0
    gray: float = 0

    @property
    def height(self) -> float:
        return len(self.lines) * (self.size + self.spacing)


@dataclass
class _Page:
    operations: bytearray = field(default_factory=bytearray)

    def add(self, operation: bytes | str) -> None:
        if isinstance(operation, str):
            operation = operation.encode("ascii")
        self.operations.extend(operation)
        if not operation.endswith(b"\n"):
            self.operations.extend(b"\n")


class _PdfReport:
    def __init__(self, logo: bytes | None = None) -> None:
        self.pages: list[_Page] = []
        self.page = _Page()
        self.pages.append(self.page)
        self.y = MARGIN
        self.logo = logo
        self._pending_text: list[_TextBlock] = []

    def brand_logo(self) -> None:
        """Place a bounded logo without distorting its aspect ratio."""
        if not self.logo:
            return
        self.ensure(72)
        width, height = _jpeg_dimensions(self.logo)
        scale = min(96 / width, 64 / height)
        width, height = width * scale, height * scale
        self.page.add(f"q {width:.2f} 0 0 {height:.2f} {MARGIN:.2f} {self._py(self.y + height):.2f} cm /Im1 Do Q")
        self.y += height + 8

    @staticmethod
    def _py(top: float) -> float:
        return PAGE_HEIGHT - top

    def new_page(self) -> None:
        self.page = _Page()
        self.pages.append(self.page)
        self.y = MARGIN

    def ensure(self, height: float) -> None:
        if self.y + height > PAGE_HEIGHT - MARGIN:
            self.new_page()

    def text(self, x: float, top: float, text: str, *, size: float = 10, bold: bool = False, gray: float = 0) -> None:
        font = "/F2" if bold else "/F1"
        y = self._py(top + size)
        self.page.add(f"{gray:.3f} g")
        self.page.add(b"BT " + font.encode("ascii") + f" {size:.2f} Tf 1 0 0 1 {x:.2f} {y:.2f} Tm ".encode("ascii") + _pdf_literal(text) + b" Tj ET")
        if gray:
            self.page.add("0 g")

    def line(self, x1: float, top1: float, x2: float, top2: float, *, gray: float = 0.75, width: float = 0.6) -> None:
        self.page.add(f"{gray:.3f} G {width:.2f} w {x1:.2f} {self._py(top1):.2f} m {x2:.2f} {self._py(top2):.2f} l S 0 G")

    def rect(self, x: float, top: float, width: float, height: float, *, gray: float = 0.85) -> None:
        self.page.add(f"{gray:.3f} G 0.6 w {x:.2f} {self._py(top + height):.2f} {width:.2f} {height:.2f} re S 0 G")

    def colored_line(self, points: list[tuple[float, float]], rgb: tuple[float, float, float], *, width: float = 1.6) -> None:
        if len(points) < 2:
            return
        r, g, b = rgb
        first_x, first_top = points[0]
        ops = [f"{r:.3f} {g:.3f} {b:.3f} RG {width:.2f} w {first_x:.2f} {self._py(first_top):.2f} m"]
        for x, top in points[1:]:
            ops.append(f"{x:.2f} {self._py(top):.2f} l")
        ops.append("S 0 G")
        self.page.add(" ".join(ops))

    def _draw_text_block(self, block: _TextBlock) -> None:
        for line in block.lines:
            self.ensure(block.size + block.spacing)
            self.text(MARGIN + block.indent, self.y, line, size=block.size, bold=block.bold, gray=block.gray)
            self.y += block.size + block.spacing

    def _flush_pending(self, following_height: float) -> None:
        # Delay headings until the first content is measured, including nested headings.
        pending, self._pending_text = self._pending_text, []
        if not pending and not following_height:
            return
        height = sum(block.height for block in pending) + following_height
        self.ensure(min(height, PAGE_HEIGHT - 2 * MARGIN))
        for block in pending:
            self._draw_text_block(block)

    def paragraph(self, text: str, *, size: float = 9.5, bold: bool = False, indent: float = 0, gray: float = 0, spacing: float = 3, keep_with_next: bool = False) -> None:
        block = _TextBlock(_wrap(text, size, CONTENT_WIDTH - indent, bold), size, spacing, bold, indent, gray)
        if keep_with_next:
            self._pending_text.append(block)
            return
        self._flush_pending(min(block.height, 2 * (size + spacing)))
        self._draw_text_block(block)

    def heading(self, text: str, *, level: int = 1) -> None:
        size = 20 if level == 1 else 14
        gap = 8 if level == 1 else 6
        self._pending_text.append(_TextBlock(_wrap(text, size, CONTENT_WIDTH, True), size, gap, bold=True))

    def table(self, headers: list[str], rows: list[list[str]], widths: list[float], *, font_size: float = 7.8, keep_together: bool = False) -> None:
        row_padding = 4.0
        line_height = font_size + 2.2
        header_lines = [
            _wrap(cell, font_size, width - 2 * row_padding, True)
            for cell, width in zip(headers, widths)
        ]

        def draw_chunk(lines_by_column: list[list[str]], *, header: bool = False) -> None:
            height = max(map(len, lines_by_column), default=1) * line_height + 2 * row_padding
            x = MARGIN
            if header:
                self.page.add(f"0.94 g {MARGIN:.2f} {self._py(self.y + height):.2f} {sum(widths):.2f} {height:.2f} re f 0 g")
            for wrapped, width in zip(lines_by_column, widths):
                top = self.y + row_padding
                for line in wrapped:
                    self.text(x + row_padding, top, line, size=font_size, bold=header, gray=0.25 if header else 0)
                    top += line_height
                x += width
            self.line(MARGIN, self.y + height, MARGIN + sum(widths), self.y + height, gray=0.82)
            self.y += height

        def wrap_row(row: list[str]) -> list[list[str]]:
            return [_wrap(cell, font_size, width - 2 * row_padding) for cell, width in zip(row, widths)]

        def row_height(row: list[list[str]]) -> float:
            return max(map(len, row), default=1) * line_height + 2 * row_padding

        header_height = row_height(header_lines)
        pending_height = sum(block.height for block in self._pending_text)
        first_row = wrap_row(rows[0]) if rows else []
        fresh_capacity = PAGE_HEIGHT - 2 * MARGIN - header_height
        initial_capacity = max(line_height + 2 * row_padding, fresh_capacity - pending_height)
        reserve = header_height + (min(row_height(first_row), initial_capacity) if rows else 0)
        if keep_together:
            table_height = header_height + sum(row_height(wrap_row(row)) for row in rows)
            if table_height + pending_height <= PAGE_HEIGHT - 2 * MARGIN:
                reserve = table_height
        self._flush_pending(reserve)
        draw_chunk(header_lines, header=True)
        for index, row in enumerate(rows):
            remaining = first_row if index == 0 else wrap_row(row)
            height = row_height(remaining)
            capacity = initial_capacity if index == 0 else fresh_capacity
            # Keep ordinary rows intact; oversized records can continue across pages.
            if height <= capacity and self.y + height > PAGE_HEIGHT - MARGIN:
                self.new_page()
                draw_chunk(header_lines, header=True)
            while any(remaining):
                available = int((PAGE_HEIGHT - MARGIN - self.y - 2 * row_padding) // line_height)
                if available < 1:
                    self.new_page()
                    draw_chunk(header_lines, header=True)
                    continue
                chunk = [lines[:available] for lines in remaining]
                draw_chunk(chunk)
                remaining = [lines[available:] for lines in remaining]
        self.y += 8

    def chart(self, series: list[tuple[str, list[dict[str, Any]], tuple[float, float, float]]], language: str = "nl") -> bool:
        plot_series = []
        points_all: list[tuple[float, float]] = []
        for name, rows, color in series:
            points = []
            for row in rows:
                try:
                    point = (timestamp_sort_key(row.get("timestamp")), float(row.get("weight")))
                except (TypeError, ValueError):
                    continue
                if all(math.isfinite(value) for value in point):
                    points.append(point)
            if points:
                plot_series.append((name, sorted(points), color))
                points_all.extend(points)
        if not points_all:
            return False
        chart_height = 150
        min_t = min(t for t, _ in points_all)
        max_t = max(t for t, _ in points_all)
        min_w_raw = min(w for _, w in points_all)
        max_w_raw = max(w for _, w in points_all)
        pad = max(10.0, (max_w_raw - min_w_raw) * 0.1)
        lower = max(0.0, min_w_raw - pad)
        upper = max_w_raw + pad
        target_step = (upper - lower) / 5
        magnitude = 10 ** math.floor(math.log10(target_step))
        step = next(value * magnitude for value in (1, 2, 2.5, 5, 10) if value * magnitude >= target_step)
        min_w = math.floor(lower / step) * step
        max_w = math.ceil(upper / step) * step
        weight_ticks = [min_w + index * step for index in range(round((max_w - min_w) / step) + 1)]
        label_width = max(_estimate_width(_format_weight(value, language), 7.5) for value in weight_ticks)
        chart_left = MARGIN + label_width + 10
        chart_width = PAGE_WIDTH - MARGIN - chart_left

        legend_rows: list[list[tuple[list[str], tuple[float, float, float], float]]] = [[]]
        for name, _, color in plot_series:
            width = min(CONTENT_WIDTH, _estimate_width(name, 8) + 34)
            if sum(entry[2] for entry in legend_rows[-1]) + width > CONTENT_WIDTH:
                legend_rows.append([])
            legend_rows[-1].append((_wrap(name, 8, width - 20), color, width))
        legend_heights = [max(len(entry[0]) for entry in row) * 10 + 4 for row in legend_rows]
        self._flush_pending(16 + chart_height + 32 + sum(legend_heights) + 8)

        self.text(MARGIN, self.y, _pdf_text(language, "weight_chart"), size=11, bold=True)
        self.y += 16
        chart_top = self.y
        for value in weight_ticks:
            top = chart_top + (1 - (value - min_w) / (max_w - min_w)) * chart_height
            self.line(chart_left, top, chart_left + chart_width, top, gray=0.88, width=0.4)
            label = _format_weight(value, language)
            self.text(chart_left - 10 - _estimate_width(label, 7.5), top - 4, label, size=7.5, gray=0.35)

        for index in range(5) if max_t > min_t else (2,):
            fraction = index / 4
            x = chart_left + fraction * chart_width
            self.line(x, chart_top, x, chart_top + chart_height, gray=0.92, width=0.4)
            stamp = min_t + fraction * (max_t - min_t)
            local = dt_util.as_local(datetime.fromtimestamp(stamp, UTC))
            label = local.strftime("%Y-%m-%d" if language == "en" else "%d-%m-%Y")
            width = _estimate_width(label, 7)
            label_x = min(PAGE_WIDTH - MARGIN - width, max(chart_left, x - width / 2))
            self.text(label_x, chart_top + chart_height + 5, label, size=7, gray=0.35)
            if max_t - min_t < 2 * 86400:
                self.text(label_x, chart_top + chart_height + 15, local.strftime("%H:%M"), size=7, gray=0.35)
        self.line(chart_left, chart_top, chart_left, chart_top + chart_height, gray=0.65)
        self.line(chart_left, chart_top + chart_height, chart_left + chart_width, chart_top + chart_height, gray=0.65)

        for _, points, color in plot_series:
            chart_points: list[tuple[float, float]] = []
            for ts, weight in points:
                x = chart_left + (0.5 if max_t == min_t else (ts - min_t) / (max_t - min_t)) * chart_width
                top = chart_top + (1 - (weight - min_w) / (max_w - min_w)) * chart_height
                chart_points.append((x, top))
            self.colored_line(chart_points, color)
            for x, top in chart_points:
                self.page.add(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg {x - 2:.2f} {self._py(top + 2):.2f} 4 4 re f 0 g")

        self.y = chart_top + chart_height + 32
        for row, height in zip(legend_rows, legend_heights):
            self.ensure(height)
            legend_x = MARGIN
            for lines, color, width in row:
                self.page.add(f"{color[0]:.3f} {color[1]:.3f} {color[2]:.3f} rg {legend_x:.2f} {self._py(self.y + 7):.2f} 10 3 re f 0 g")
                for index, line in enumerate(lines):
                    self.text(legend_x + 14, self.y + index * 10, line, size=8)
                legend_x += width
            self.y += height
        self.y += 8
        return True

    def build(self) -> bytes:
        self._flush_pending(0)
        objects: list[bytes] = []

        def add_object(data: bytes) -> int:
            objects.append(data)
            return len(objects)

        font_regular = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
        font_bold = add_object(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>")
        logo_ref = None
        if self.logo:
            width, height = _jpeg_dimensions(self.logo)
            logo_ref = add_object(
                f"<< /Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length {len(self.logo)} >>\nstream\n".encode("ascii")
                + self.logo + b"\nendstream"
            )
        pages_placeholder = add_object(b"")
        page_refs: list[int] = []

        for page in self.pages:
            stream = bytes(page.operations)
            content_ref = add_object(b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"endstream")
            resources = f"/Font << /F1 {font_regular} 0 R /F2 {font_bold} 0 R >>"
            if logo_ref:
                resources += f" /XObject << /Im1 {logo_ref} 0 R >>"
            page_ref = add_object(
                f"<< /Type /Page /Parent {pages_placeholder} 0 R /MediaBox [0 0 {PAGE_WIDTH:.2f} {PAGE_HEIGHT:.2f}] ".encode("ascii")
                + f"/Resources << {resources} >> ".encode("ascii")
                + f"/Contents {content_ref} 0 R >>".encode("ascii")
            )
            page_refs.append(page_ref)

        kids = " ".join(f"{ref} 0 R" for ref in page_refs)
        objects[pages_placeholder - 1] = f"<< /Type /Pages /Kids [{kids}] /Count {len(page_refs)} >>".encode("ascii")
        catalog_ref = add_object(f"<< /Type /Catalog /Pages {pages_placeholder} 0 R >>".encode("ascii"))

        output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
        offsets = [0]
        for index, obj in enumerate(objects, start=1):
            offsets.append(len(output))
            output.extend(f"{index} 0 obj\n".encode("ascii"))
            output.extend(obj)
            output.extend(b"\nendobj\n")
        xref = len(output)
        output.extend(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
        output.extend(b"0000000000 65535 f \n")
        for offset in offsets[1:]:
            output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
        output.extend(
            f"trailer\n<< /Size {len(objects) + 1} /Root {catalog_ref} 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode("ascii")
        )
        return bytes(output)


def build_pdf_export(
    storage: PuppyTrackerStorage,
    litter_id: str,
    *,
    puppy_id: str | None = None,
    range_hours: float | None = None,
    sections: dict[str, bool] | None = None,
    owner_records: list[dict[str, Any]] | None = None,
    language: str = "nl",
    dossier_types: list[str] | None = None,
    dossier_scopes: list[str] | None = None,
    branding: dict[str, str] | None = None,
) -> tuple[str, str, str]:
    """Return filename, MIME type and base64 PDF content."""
    litter = storage.get_litter(litter_id)
    if litter is None:
        raise ValueError("Unknown litter")
    if language not in _PDF_LABELS:
        raise ValueError("Unsupported PDF language")
    if dossier_scopes is None:
        dossier_scopes = ["litter", "puppy"]
    if any(scope not in {"litter", "puppy"} for scope in dossier_scopes):
        raise ValueError("Unsupported dossier scope")
    data = storage.get_data()
    mother_details = parent_details_for_litter(data, litter, "mother")
    father_details = parent_details_for_litter(data, litter, "father")

    def t(key: str, **values: Any) -> str:
        return _pdf_text(language, key, **values)

    visible = {
        "identity": True, "summary": True, "chart": True, "measurements": True,
        "care": True, "dossier": True, "behavior": True,
        "attention": True, "owners": True, "owner_contact": False,
        "brand_logo": True, "breeder_name": True, "breeder_contact": False,
        "profile_note": False,
    }
    if isinstance(sections, dict):
        visible.update({key: bool(value) for key, value in sections.items() if key in visible})
    if not visible["owners"]:
        visible["owner_contact"] = False
    puppies: list[tuple[str, dict[str, Any]]] = []
    for current_id, puppy in litter.get("puppies", {}).items():
        if puppy_id is not None and current_id != puppy_id:
            continue
        puppies.append((current_id, puppy))
    if puppy_id is not None and not puppies:
        raise ValueError("Unknown puppy")

    branding = branding if branding is not None else storage.get_breeder()
    logo = _report_logo(branding.get("logo_base64")) if visible["brand_logo"] else None
    report = _PdfReport(logo)
    report.brand_logo()
    if visible["breeder_name"] and branding.get("name"):
        report.paragraph(str(branding["name"])[:200], size=14, bold=True)
    if visible["breeder_contact"] and branding.get("contact"):
        for line in str(branding["contact"])[:2000].splitlines():
            report.paragraph(line, size=9)
    title = f"Puppy Tracker - {litter.get('name') or t('litter')}"
    if puppy_id is not None and puppies:
        title = f"Puppy Tracker - {puppies[0][1].get('name') or 'Puppy'}"
    report.heading(title, level=1)
    local_now = dt_util.as_local(dt_util.now()).strftime("%Y-%m-%d %H:%M" if language == "en" else "%d-%m-%Y %H:%M")
    period = _period_label(range_hours, language)
    report.paragraph(f"{period}  |  {t('generated')} {local_now}", size=9, gray=0.35)
    report.y += 4

    if visible["identity"]:
        report.table(
            [t("litter"), t("birth_date"), t("puppies")],
            [[
                str(litter.get("name") or "—"),
                _format_date(litter.get("birth_date"), language),
                str(len(puppies)),
            ]],
            [221, 150, 110],
            font_size=8.5,
        )
        report.heading(t("parent_details"), level=2)
        report.table(
            [t("parent"), t("registered_name"), t("call_name"), t("birth_date"), t("breed"), t("wala"), t("chip")],
            [
                [t("father"), father_details.get("registered_name") or "—", father_details.get("call_name") or "—", _format_date(father_details.get("birth_date"), language), father_details.get("breed") or "—", father_details.get("wala_number") or "—", father_details.get("chip_number") or "—"],
                [t("mother"), mother_details.get("registered_name") or "—", mother_details.get("call_name") or "—", _format_date(mother_details.get("birth_date"), language), mother_details.get("breed") or "—", mother_details.get("wala_number") or "—", mother_details.get("chip_number") or "—"],
            ],
            [40, 78, 55, 65, 88, 70, 85],
            font_size=7.1,
            keep_together=True,
        )

    if visible["owners"]:
        owner_by_id = {str(owner.get("id")): owner for owner in (owner_records or [])}
        owner_rows = []
        for _current_id, puppy in puppies:
            linked = [
                owner_by_id[owner_id]
                for owner_id in puppy.get("owner_ids", [])
                if owner_id in owner_by_id
            ]
            for owner in linked:
                placement_parts = [
                    _display_enum(
                        owner.get("placement_status"),
                        _PDF_ENUMS[language]["placement"],
                        "interested",
                    )
                ]
                if owner.get("placement_date"):
                    placement_parts.append(f"{t('placement_date')}: {owner['placement_date']}")
                if owner.get("expected_pickup_date"):
                    placement_parts.append(f"{t('expected_pickup')}: {owner['expected_pickup_date']}")
                payment_parts = [
                    _display_enum(
                        owner.get("payment_status"),
                        _PDF_ENUMS[language]["payment"],
                        "none",
                    )
                ]
                if owner.get("payment_amount") not in (None, ""):
                    payment_parts.append(f"{t('amount')}: {owner['payment_amount']}")
                if owner.get("registration_fee_amount") not in (None, ""):
                    payment_parts.append(
                        f"{t('registration_fee')}: {owner['registration_fee_amount']}"
                    )
                if owner.get("deposit_amount") not in (None, ""):
                    payment_parts.append(f"{t('deposit')}: {owner['deposit_amount']}")
                if owner.get("deposit_date"):
                    payment_parts.append(f"{t('deposit_date')}: {owner['deposit_date']}")
                calculated_final_payment = final_payment_amount(owner)
                if calculated_final_payment is not None:
                    payment_parts.append(
                        f"{t('final_payment')}: {calculated_final_payment}"
                    )
                payment_parts.append(
                    _display_enum(
                        owner.get("payment_method"),
                        _PDF_ENUMS[language]["method"],
                        "none",
                    )
                )
                if owner.get("payment_balance") not in (None, ""):
                    payment_parts.append(f"{t('balance')}: {owner['payment_balance']}")
                if owner.get("payment_date"):
                    payment_parts.append(f"{t('paid')}: {owner['payment_date']}")
                row = [
                    str(puppy.get("name") or t("puppy")),
                    str(owner.get("name") or "—"),
                    _display_enum(owner.get("role"), _PDF_ENUMS[language]["role"], "owner"),
                    " · ".join(placement_parts),
                    " · ".join(payment_parts),
                ]
                if visible["owner_contact"]:
                    street, postal_code, city = owner_address_parts(owner)
                    row.append(
                        " · ".join(
                            (
                                f"{t('email')}: {owner.get('email') or '—'}",
                                f"{t('phone')}: {owner.get('phone') or '—'}",
                                f"{t('street')}: {street or '—'}",
                                f"{t('postal_code')}: {postal_code or '—'}",
                                f"{t('city')}: {city or '—'}",
                            )
                        )
                    )
                owner_rows.append(row)
        if owner_rows:
            report.heading(t("owners"), level=2)
            owner_headers = [t("puppy"), t("owner"), t("role"), t("placement"), t("payment")]
            owner_widths = [50, 90, 65, 105, 201]
            if visible["owner_contact"]:
                owner_headers.append(t("contact"))
                owner_widths = [45, 75, 55, 75, 125, 136]
            report.table(owner_headers, owner_rows, owner_widths, font_size=6.6)
        else:
            report.heading(t("owners"), level=2)
            report.paragraph(t("no_owners"), size=9)

    warnings: list[str] = []
    summary_rows: list[list[str]] = []
    chart_series: list[tuple[str, list[dict[str, Any]], tuple[float, float, float]]] = []
    for current_id, puppy in puppies:
        if visible["summary"] or visible["attention"]:
            metrics = calculate_puppy_metrics(storage, litter_id, current_id)
            status_label = _status_label(metrics, language) if visible["attention"] else ""
            if visible["attention"] and metrics.get("needs_attention"):
                warnings.append(f"{puppy.get('name') or t('puppy')}: {status_label}")
            if visible["summary"]:
                birth_weight = puppy.get("birth_weight")
                try:
                    birth = float(birth_weight) if birth_weight is not None else None
                except (TypeError, ValueError):
                    birth = None
                summary_rows.append([
                    str(puppy.get("name") or t("puppy")),
                    str(puppy.get("collar_color") or "—"),
                    t("female") if puppy.get("sex") == "female" else t("male") if puppy.get("sex") == "male" else str(puppy.get("sex") or "—"),
                    _format_weight(birth, language),
                    _format_weight(metrics.get("current_weight"), language),
                    _format_percent(metrics.get("growth_24h_percent"), language),
                    _format_percent(metrics.get("growth_birth_percent"), language),
                    *([status_label] if visible["attention"] else []),
                ])
        if visible["chart"]:
            chart_series.append((
                str(puppy.get("name") or t("puppy")),
                _active_measurements(puppy, range_hours),
                _collar_rgb(puppy.get("collar_color"), len(chart_series)),
            ))

    if visible["attention"] and warnings:
        report.heading(t("attention"), level=2)
        for warning in warnings:
            report.paragraph(f"• {warning}", size=9.5)
    elif visible["attention"]:
        report.paragraph(t("no_attention"), size=9.5, bold=True)
        report.y += 4

    if visible["summary"]:
        report.heading(t("summary"), level=2)
        report.table(
            [t("puppy"), t("collar"), t("sex"), t("birth"), t("current"), t("growth_24h"), t("total"), *([t("status")] if visible["attention"] else [])],
            summary_rows,
            [76, 55, 42, 58, 55, 60, 55, 80] if visible["attention"] else [98, 65, 50, 65, 65, 68, 70],
            font_size=7.4,
            keep_together=True,
        )
    if visible["chart"]:
        if not report.chart(chart_series, language):
            report.heading(t("weight_chart"), level=2)
            report.paragraph(t("no_chart"), size=9)

    def render_dossier_records(records: list[dict[str, Any]], source: str) -> None:
        report.heading(t("dossier"), level=2)
        if not records:
            report.paragraph(t("no_dossier"), size=9)
            return
        dossier_rows = []
        for record in records:
            record_type = str(record.get("type") or "other")
            dossier_rows.append([
                _format_local_datetime(record.get("occurred_at"), language),
                _PDF_RECORD_TYPES[language].get(record_type, record_type.replace("_", " ").capitalize()),
                str(record.get("title") or "—"),
                _record_data_text(record, language),
                str(record.get("note") or ""),
            ])
        report.paragraph(f"{t('source')}: {source}", size=8, gray=0.35, keep_with_next=True)
        report.table([t("date_time"), t("type"), t("details"), t("result"), t("note")], dossier_rows, [72, 58, 95, 137, 119], font_size=7)

    if visible["dossier"] and "litter" in dossier_scopes:
        render_dossier_records(
            _dossier_records(storage, litter_id, None, range_hours, dossier_types),
            t("litter_source"),
        )
    elif visible["dossier"] and not dossier_scopes:
        render_dossier_records([], t("litter_source"))

    for current_id, puppy in puppies:
        if any(visible[key] for key in ("identity", "measurements", "care", "behavior")) or (visible["dossier"] and "puppy" in dossier_scopes):
            report.heading(str(puppy.get("name") or t("puppy")), level=2)
        if visible["identity"]:
            report.heading(t("identity_details"), level=3)
            report.table(
                [t("details"), t("value")],
                [
                    [t("puppy_registered_name"), str(puppy.get("registered_name") or "—")],
                    [t("call_name"), str(puppy.get("name") or "—")],
                    [t("birth_date"), _format_date(puppy.get("birth_time") or litter.get("birth_date"), language)],
                    [t("sex"), t("female") if puppy.get("sex") == "female" else t("male") if puppy.get("sex") == "male" else str(puppy.get("sex") or "—")],
                    [t("coat_color"), str(puppy.get("coat_color") or "—")],
                    [t("chip"), str(puppy.get("chip_number") or "—")],
                    [t("breed"), str(puppy.get("breed") or "—")],
                    [t("collar"), str(puppy.get("collar_color") or "—")],
                    [t("birth_weight"), _format_weight(puppy.get("birth_weight"), language)],
                ],
                [130, 351],
                font_size=8,
                keep_together=True,
            )
            if visible["profile_note"] and puppy.get("profile_note"):
                report.heading(t("profile_note"), level=3)
                for line in str(puppy["profile_note"]).splitlines():
                    report.paragraph(line)
        if visible["measurements"]:
            all_rows = puppy_measurements(puppy, active_only=True)
            rows = _active_measurements(puppy, range_hours)
            table_rows: list[list[str]] = []
            previous: float | None = None
            if rows:
                first_timestamp = timestamp_sort_key(rows[0].get("timestamp"))
                for measurement in all_rows:
                    if timestamp_sort_key(measurement.get("timestamp")) >= first_timestamp:
                        break
                    try:
                        previous = float(measurement.get("weight"))
                    except (TypeError, ValueError):
                        continue
            for measurement in rows:
                try:
                    weight = float(measurement.get("weight"))
                except (TypeError, ValueError):
                    continue
                diff = weight - previous if previous is not None else None
                previous = weight
                table_rows.append([
                    _format_local_datetime(measurement.get("timestamp"), language),
                    _format_weight(weight, language),
                    _format_signed_weight(diff, language),
                    str(measurement.get("kind") or t("weighing")),
                    str(measurement.get("note") or ""),
                ])
            if table_rows:
                report.table(
                    [t("date_time"), t("weight"), t("difference"), t("type"), t("note")],
                    table_rows,
                    [105, 60, 65, 65, 186],
                    font_size=7.6,
                )
            else:
                report.paragraph(t("no_measurements"), size=9)

        care_records = (
            _active_care_records(storage, litter_id, current_id, range_hours)
            if visible["care"]
            else []
        )
        if visible["care"]:
            report.heading(t("care"), level=2)
        if visible["care"] and care_records:
            care_rows: list[list[str]] = []
            for record in care_records:
                data = record.get("data") if isinstance(record.get("data"), dict) else {}
                status = t("completed") if data.get("care_status") == "completed" else t("missed") if data.get("care_status") == "missed" else str(data.get("care_status") or "—")
                care_rows.append([
                    _format_local_datetime(record.get("occurred_at"), language),
                    str(record.get("title") or t("care_action")),
                    str(data.get("care_age_days") if data.get("care_age_days") is not None else "—"),
                    status,
                    _care_result_text(data),
                    _format_care_score(data.get("care_score"), language),
                    str(data.get("care_instruction") or ""),
                    str(record.get("note") or ""),
                ])
            report.table(
                [t("date_time"), t("care_action"), t("day"), t("status"), t("result"), t("score"), t("instruction"), t("note")],
                care_rows,
                [68, 72, 30, 48, 70, 35, 105, 83],
                font_size=6.6,
            )
        elif visible["care"]:
            report.paragraph(t("no_care"), size=9)
        if visible["behavior"]:
            behavior_profile = build_behavior_profile(
                _behavior_records(storage, litter_id, current_id, range_hours)
            )
            report.heading(t("behavior"), level=2)
            if behavior_profile["observation_count"]:
                report.table(
                    [t("behavior_final"), t("behavior_sessions"), t("behavior_criteria")],
                    [[
                        f"{_format_care_score(behavior_profile['final_score'], language)}/5",
                        str(behavior_profile["observation_count"]),
                        f"{behavior_profile['criteria_scored']}/{behavior_profile['criteria_total']}",
                    ]],
                    [170, 155, 156],
                    font_size=8,
                )
                report.paragraph(t("behavior_note"), size=7.5, gray=0.4)
                for group, group_criteria in BEHAVIOR_GROUPS:
                    rows = []
                    for criterion in group_criteria:
                        item = behavior_profile["criteria"].get(criterion)
                        if not item:
                            continue
                        rows.append([
                            _BEHAVIOR_LABELS[language][criterion],
                            _format_care_score(item["average"], language),
                            str(item["latest"]),
                            str(item["count"]),
                        ])
                    if rows:
                        group_title = t("behavior_observations" if group == "observations" else "behavior_traits")
                        group_average = behavior_profile["groups"][group]["average"]
                        report.paragraph(
                            f"{group_title} - {t('behavior_average')}: {_format_care_score(group_average, language)}/5",
                            size=8.5,
                            bold=True,
                            keep_with_next=True,
                        )
                        report.table(
                            [t("details"), t("behavior_average"), t("behavior_latest"), t("behavior_count")],
                            rows,
                            [285, 70, 65, 61],
                            font_size=7.2,
                        )
                history_rows = []
                for observation in behavior_profile["observations"]:
                    observer_context = " · ".join(
                        str(value)
                        for value in (observation.get("observer"), observation.get("context"))
                        if value not in (None, "")
                    )
                    history_rows.append([
                        _format_local_datetime(observation.get("occurred_at"), language),
                        _format_care_score(observation.get("age_days"), language),
                        observer_context or "—",
                        f"{_format_care_score(observation.get('score'), language)}/5",
                        str(observation.get("note") or ""),
                    ])
                report.table(
                    [t("date_time"), t("behavior_age"), t("behavior_observer"), t("score"), t("note")],
                    history_rows,
                    [82, 55, 130, 48, 166],
                    font_size=6.8,
                )
            else:
                report.paragraph(t("no_behavior"), size=9)
        if visible["dossier"] and "puppy" in dossier_scopes:
            render_dossier_records(
                _dossier_records(storage, litter_id, current_id, range_hours, dossier_types),
                str(puppy.get("name") or t("puppy")),
            )

    report.ensure(40)
    report.line(MARGIN, report.y, PAGE_WIDTH - MARGIN, report.y, gray=0.8)
    report.y += 8
    report.paragraph(
        t("disclaimer"),
        size=7.5,
        gray=0.45,
    )

    pdf_bytes = report.build()
    stamp = dt_util.now().strftime("%Y%m%d-%H%M%S")
    subject = puppies[0][1].get("name") if puppy_id is not None and puppies else litter.get("name")
    filename = f"puppy-tracker-{_safe_filename(subject)}-{stamp}.pdf"
    return filename, "application/pdf", base64.b64encode(pdf_bytes).decode("ascii")
