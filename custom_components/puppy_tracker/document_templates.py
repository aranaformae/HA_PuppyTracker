"""Bounded document templates: text substitution only, never executable templates."""

from __future__ import annotations

from copy import deepcopy
from datetime import date
from decimal import Decimal
from functools import lru_cache
from hashlib import sha256
import json
from pathlib import Path
import re
from typing import Any

from .dog_identity import parent_details_for_litter
from .owners import final_payment_amount, owner_for_litter
from .time_utils import local_datetime, format_local_timestamp

FORMAT = "puppy_tracker_document_template"
VERSION = 1
BUILTIN_TEMPLATE_ID = "handover-example-nl"
_BUILTIN_FILES = {f"{kind}-{language}": f"{kind}.{language}.json"
                  for kind in ("handover-example", "puppy-profile", "payment-overview", "payment-receipt", "reservation-notes", "handover-checklist")
                  for language in ("nl", "en")}
BUILTIN_TEMPLATE_IDS = frozenset(_BUILTIN_FILES)
MAX_TEMPLATES = 30
MAX_DOCUMENTS = 100
MAX_TEMPLATE_BYTES = 150_000
TOKEN = re.compile(r"{{\s*([a-z_]+\.[a-z_]+)\s*}}")
IDENTIFIER = re.compile(r"^[a-zA-Z0-9_-]{1,80}$")

# Stable identifiers are deliberately independent of UI language.
FIELDS = {
    "fokker.naam": ("Fokkersnaam", "Breeder name"),
    "fokker.vertegenwoordigers": ("Vertegenwoordigers", "Representatives"),
    "fokker.straat": ("Straat fokker", "Breeder street"),
    "fokker.postcode": ("Postcode fokker", "Breeder postal code"),
    "fokker.plaats": ("Plaats fokker", "Breeder city"),
    "fokker.telefoon": ("Telefoon fokker", "Breeder phone"),
    "fokker.email": ("E-mail fokker", "Breeder email"),
    "fokker.registratie": ("Fokkerregistratie", "Breeder registration"),
    "fokker.ubn": ("UBN", "UBN"),
    "fokker.iban": ("IBAN", "IBAN"),
    "fokker.rekeninghouder": ("Rekeninghouder", "Account holder"),
    "koper.naam": ("Koper(s)", "Buyer(s)"),
    "koper.straat": ("Straat koper(s)", "Buyer street"),
    "koper.postcode": ("Postcode koper(s)", "Buyer postal code"),
    "koper.plaats": ("Plaats koper(s)", "Buyer city"),
    "koper.telefoon": ("Telefoon koper(s)", "Buyer phone"),
    "koper.email": ("E-mail koper(s)", "Buyer email"),
    "nest.naam": ("Nest", "Litter"),
    "nest.geboortedatum": ("Geboortedatum nest", "Litter birth date"),
    "pup.nestnaam": ("Nestnaam pup", "Registered puppy name"),
    "pup.naam": ("Roepnaam pup", "Puppy call name"),
    "pup.bandkleur": ("Bandkleur", "Collar colour"),
    "pup.geboortedatum": ("Geboortedatum pup", "Puppy birth date"),
    "pup.geboortetijd": ("Geboortetijd pup", "Puppy birth time"),
    "pup.geboortegewicht": ("Geboortegewicht pup", "Puppy birth weight"),
    "pup.huidig_gewicht": ("Laatst gemeten gewicht", "Last measured weight"),
    "pup.gewicht_gemeten_op": ("Gewogen op", "Weighed on"),
    "pup.profielnotitie": ("Profielnotitie pup", "Puppy profile note"),
    "pup.geslacht": ("Geslacht", "Sex"),
    "pup.vachtkleur": ("Vachtkleur", "Coat colour"),
    "pup.chipnummer": ("Chipnummer pup", "Puppy microchip"),
    "pup.soort": ("Soort pup", "Puppy breed/type"),
    "betaling.totaal": ("Koopprijs", "Purchase price"),
    "betaling.inschrijfgeld": ("Inschrijfgeld", "Registration fee"),
    "betaling.aanbetaling": ("Aanbetaling", "Deposit"),
    "betaling.datum_aanbetaling": ("Datum aanbetaling", "Deposit date"),
    "betaling.slotbetaling": ("Slotbetaling", "Final instalment"),
    "betaling.datum_slotbetaling": ("Datum slotbetaling", "Final payment date"),
    "betaling.openstaand": ("Werkelijk openstaand", "Actual outstanding balance"),
    "ontvangst.bedrag": ("Ontvangen bedrag", "Amount received"),
    "ontvangst.datum": ("Datum ontvangst", "Date received"),
    "ontvangst.soort": ("Soort betaling", "Payment type"),
    "ontvangst.betaalwijze": ("Betaalwijze ontvangst", "Receipt method"),
    "ontvangst.referentie": ("Betalingsreferentie", "Payment reference"),
    "ontvangst.notitie": ("Betalingsnotitie", "Payment note"),
    "plaatsing.status": ("Plaatsingsstatus", "Placement status"),
    "plaatsing.datum": ("Werkelijke plaatsingsdatum", "Actual placement date"),
    "overdracht.datum": ("Verwachte ophaaldatum", "Expected pickup date"),
    "contract.datum": ("Documentdatum", "Document date"),
    "contract.plaats": ("Plaats ondertekening", "Signing location"),
}
for role, en in (("vader", "Father"), ("moeder", "Mother")):
    for key, nl, label in (("nestnaam", "Stamboomnaam", "Registered name"), ("naam", "Roepnaam", "Call name"),
                           ("geboortedatum", "Geboortedatum", "Birth date"), ("chipnummer", "Chipnummer", "Microchip"),
                           ("soort", "Soort", "Breed/type"), ("registratie", "Registratie", "Registration")):
        FIELDS[f"{role}.{key}"] = (f"{nl} {role}", f"{en}: {label}")


def fingerprint(value: Any) -> str:
    return sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def _text(value: Any, limit: int) -> str:
    if not isinstance(value, str) or len(value) > limit or any(ord(c) < 32 and c not in "\n\t" for c in value):
        raise ValueError("invalid_document_text")
    return value.strip()


def template_fields(template: dict) -> set[str]:
    return {key for block in template["blocks"] for key in (
        TOKEN.findall(block["text"]) + block.get("fields", [])
    )}


def normalize_template(value: Any) -> dict:
    if not isinstance(value, dict) or len(json.dumps(value, ensure_ascii=False).encode()) > MAX_TEMPLATE_BYTES:
        raise ValueError("invalid_template")
    if set(value) - {"format", "version", "name", "language", "blocks", "optional_fields", "logo", "watermark", "watermark_type", "watermark_text", "initials"}:
        raise ValueError("invalid_template")
    if value.get("format") != FORMAT or type(value.get("version")) is not int or value["version"] != VERSION:
        raise ValueError("unsupported_template_version")
    name = _text(value.get("name"), 150)
    if not name or value.get("language") not in ("nl", "en"):
        raise ValueError("invalid_template")
    blocks = value.get("blocks")
    if not isinstance(blocks, list) or not 1 <= len(blocks) <= 200:
        raise ValueError("invalid_template")
    normalized = []
    for block in blocks:
        if not isinstance(block, dict) or set(block) - {"type", "text", "fields", "bold"}:
            raise ValueError("invalid_template_block")
        kind = block.get("type")
        if kind not in ("heading", "text", "data", "signature", "page_break"):
            raise ValueError("invalid_template_block")
        content = _text(block.get("text", ""), 12000)
        stripped = TOKEN.sub("", content)
        if "{{" in stripped or "}}" in stripped or "{%" in content or "{#" in content:
            raise ValueError("unknown_template_field")
        fields = block.get("fields", [])
        if not isinstance(fields, list) or len(fields) > 50 or any(not isinstance(k, str) or k not in FIELDS for k in fields):
            raise ValueError("unknown_template_field")
        if any(key not in FIELDS for key in TOKEN.findall(content)):
            raise ValueError("unknown_template_field")
        if kind == "data" and not fields:
            raise ValueError("invalid_template_block")
        if type(block.get("bold", False)) is not bool:
            raise ValueError("invalid_template_block")
        normalized.append({"type": kind, "text": content, "fields": list(dict.fromkeys(fields)) if kind == "data" else [], "bold": block.get("bold", False)})
    optional = value.get("optional_fields", [])
    if not isinstance(optional, list) or any(not isinstance(key, str) or key not in FIELDS for key in optional):
        raise ValueError("unknown_template_field")
    flags = {}
    for key, default in (("logo", True), ("watermark", False), ("initials", True)):
        flags[key] = value.get(key, default)
        if type(flags[key]) is not bool:
            raise ValueError("invalid_template")
    decoration = {}
    # Leave older normalized templates byte-for-byte stable for revision checks.
    if "watermark_type" in value:
        if value["watermark_type"] not in ("text", "logo"):
            raise ValueError("invalid_template")
        decoration["watermark_type"] = value["watermark_type"]
    if "watermark_text" in value:
        decoration["watermark_text"] = " ".join(_text(value["watermark_text"], 150).split())
    return {"format": FORMAT, "version": VERSION, "name": name, "language": value["language"],
            "blocks": normalized, "optional_fields": sorted(set(optional)), **flags, **decoration}


def template_uses_logo(template: dict) -> bool:
    return bool(template.get("logo") or (template.get("watermark") and template.get("watermark_type") == "logo"))


@lru_cache(maxsize=1)
def _builtin_catalog() -> dict[str, dict]:
    directory = Path(__file__).parent / "document_templates"
    return {key: normalize_template(json.loads((directory / filename).read_text())) for key, filename in _BUILTIN_FILES.items()}


def built_in_templates() -> dict[str, dict]:
    return deepcopy(_builtin_catalog())


def built_in_template(template_id: str = BUILTIN_TEMPLATE_ID) -> dict:
    return deepcopy(_builtin_catalog()[template_id])


def validate_document_settings(settings: dict) -> None:
    templates = settings.get("document_templates", {})
    archive = settings.get("documents", {})
    if not isinstance(templates, dict) or len(templates) > MAX_TEMPLATES or not isinstance(archive, dict) or len(archive) > MAX_DOCUMENTS:
        raise ValueError("document_limit")
    for key, template in templates.items():
        if not isinstance(key, str) or not IDENTIFIER.fullmatch(key) or key in BUILTIN_TEMPLATE_IDS:
            raise ValueError("invalid_template")
        normalize_template(template)
    files = settings.get("files", {})
    for key, document in archive.items():
        if not isinstance(key, str) or not IDENTIFIER.fullmatch(key) or not isinstance(document, dict):
            raise ValueError("invalid_document")
        if set(document) != {"id", "name", "created_at", "litter_id", "puppy_id", "puppy_name", "owner_ids", "file_id", "snapshot_id", "fingerprint"} or document["id"] != key:
            raise ValueError("invalid_document")
        for field in ("name", "created_at", "litter_id", "puppy_id", "puppy_name", "file_id"):
            _text(document.get(field), 300)
        if not isinstance(document["fingerprint"], str) or not re.fullmatch(r"[a-f0-9]{64}", document["fingerprint"]):
            raise ValueError("invalid_document")
        if not isinstance(document["owner_ids"], list) or not 1 <= len(document["owner_ids"]) <= 4 or any(not isinstance(i, str) or not i or len(i) > 300 for i in document["owner_ids"]):
            raise ValueError("invalid_document")
        if files.get(document.get("file_id"), {}).get("content_type") != "application/pdf":
            raise ValueError("document_file_missing")
        if not isinstance(document.get("snapshot_id"), str) or files.get(document["snapshot_id"], {}).get("content_type") != "application/json":
            raise ValueError("document_file_missing")


def validate_snapshot(snapshot: Any) -> None:
    if not isinstance(snapshot, dict) or set(snapshot) != {"template", "values", "template_revision"}:
        raise ValueError("invalid_document")
    normalize_template(snapshot["template"])
    if fingerprint(snapshot["template"]) != snapshot["template_revision"]:
        raise ValueError("invalid_document")
    values = snapshot["values"]
    # Archived snapshots predate additions to the field registry. Their saved
    # PDF and known values stay valid without inventing values for new fields.
    if not isinstance(values, dict) or not values or not set(values) <= set(FIELDS):
        raise ValueError("invalid_document")
    for key, value in values.items():
        _text(value, 12000 if key == "pup.profielnotitie" else 4000)


def document_context(storage, owners, litter_id: str, puppy_id: str, owner_ids: list[str], details: dict, language: str, payment_id: str | None = None, *, include_profile_note: bool = False) -> dict[str, str]:
    litter = storage.get_litter(litter_id)
    puppy = (litter or {}).get("puppies", {}).get(puppy_id)
    if not puppy or not owner_ids or len(owner_ids) > 4 or len(set(owner_ids)) != len(owner_ids):
        raise ValueError("choose_document_parties")
    if any(i not in (puppy.get("owner_ids") or []) or owners.get(i) is None for i in owner_ids):
        raise ValueError("choose_document_parties")
    contacts = [owner_for_litter(owners.get(i), litter_id) for i in owner_ids]
    primary = contacts[0]
    values = dict.fromkeys(FIELDS, "")
    breeder = storage.get_breeder()
    for nl, en in {"naam": "name", "vertegenwoordigers": "representatives", "straat": "street", "postcode": "postal_code", "plaats": "city", "telefoon": "phone", "email": "email", "registratie": "registration", "ubn": "ubn", "iban": "iban", "rekeninghouder": "account_holder"}.items():
        values[f"fokker.{nl}"] = breeder.get(en, "")
    for nl, en in {"naam": "name", "straat": "street", "postcode": "postal_code", "plaats": "city", "telefoon": "phone", "email": "email"}.items():
        if all(c.get(en) for c in contacts):
            values[f"koper.{nl}"] = " / ".join(str(c[en]) if en == "name" or len(contacts) == 1 else f"{c['name']}: {c[en]}" for c in contacts)
    values["nest.naam"] = litter.get("name") or ""
    def formatted_date(value):
        if not value:
            return ""
        local = local_datetime(str(value)) if len(str(value)) > 10 else None
        day = local.date() if local else date.fromisoformat(str(value)[:10])
        return day.strftime("%d-%m-%Y" if language == "nl" else "%Y-%m-%d")
    for nl, en in {"nestnaam": "registered_name", "naam": "name", "bandkleur": "collar_color", "vachtkleur": "coat_color", "chipnummer": "chip_number", "soort": "breed"}.items():
        values[f"pup.{nl}"] = puppy.get(en) or ""
    values["nest.geboortedatum"] = formatted_date(litter.get("birth_date"))
    values["pup.geboortedatum"] = formatted_date(puppy.get("birth_time") or litter.get("birth_date"))
    birth_time = puppy.get("birth_time")
    values["pup.geboortetijd"] = format_local_timestamp(birth_time, "%H:%M", fallback="")
    def grams(value):
        if value is None or value == "":
            return ""
        weight = Decimal(str(value))
        amount = f"{weight:,.0f}" if weight == weight.to_integral_value() else f"{weight:,.1f}"
        return f"{amount.translate(str.maketrans(',.', '.,')) if language == 'nl' else amount} g"
    values["pup.geboortegewicht"] = grams(puppy.get("birth_weight"))
    measurements = storage.get_measurements(litter_id, puppy_id, include_inactive=False)
    if measurements:
        latest = measurements[0]
        values["pup.huidig_gewicht"] = grams(latest.get("weight"))
        stamp = latest.get("timestamp")
        values["pup.gewicht_gemeten_op"] = format_local_timestamp(stamp, "%d-%m-%Y %H:%M" if language == "nl" else "%Y-%m-%d %H:%M", fallback="")
    values["pup.profielnotitie"] = (puppy.get("profile_note") or "") if include_profile_note else ""
    values["pup.geslacht"] = {"male": "Reu" if language == "nl" else "Male", "female": "Teef" if language == "nl" else "Female"}.get(puppy.get("sex"), "")
    for nl, en in (("vader", "father"), ("moeder", "mother")):
        parent = parent_details_for_litter(storage.get_data(), litter, en)
        for key, field in {"nestnaam": "registered_name", "naam": "call_name", "chipnummer": "chip_number", "soort": "breed", "registratie": "wala_number"}.items():
            values[f"{nl}.{key}"] = parent.get(field) or ""
        values[f"{nl}.geboortedatum"] = formatted_date(parent.get("birth_date"))
    for key, field in {"totaal": "payment_amount", "inschrijfgeld": "registration_fee_amount", "aanbetaling": "deposit_amount", "openstaand": "payment_balance"}.items():
        amount = primary.get(field)
        if amount not in (None, ""):
            values[f"betaling.{key}"] = f"€ {Decimal(str(amount)):,.2f}"
            if language == "nl":
                values[f"betaling.{key}"] = values[f"betaling.{key}"].translate(str.maketrans(",.", ".,"))
    final = final_payment_amount(primary)
    if primary.get("payment_amount") not in (None, "") and final is not None:
        amount = f"€ {Decimal(str(final)):,.2f}"
        values["betaling.slotbetaling"] = amount.translate(str.maketrans(",.", ".,")) if language == "nl" else amount
    for key, field in (("betaling.datum_aanbetaling", "deposit_date"), ("betaling.datum_slotbetaling", "payment_date"), ("overdracht.datum", "expected_pickup_date")):
        values[key] = formatted_date(primary.get(field))
    values["plaatsing.datum"] = formatted_date(primary.get("placement_date"))
    status = primary.get("placement_status")
    values["plaatsing.status"] = {
        "interested": ("Geïnteresseerd", "Interested"), "option": ("Optie", "Option"),
        "reserved": ("Gereserveerd", "Reserved"), "sold": ("Verkocht", "Sold"),
        "placed": ("Geplaatst", "Placed"),
    }.get(status, ("", ""))[0 if language == "nl" else 1]
    if payment_id is not None:
        payment = next((event for event in primary.get("payment_events", []) if event["id"] == payment_id and not event["voided_at"]), None)
        if payment is None:
            raise ValueError("payment_receipt_missing")
        amount = f"€ {Decimal(payment['amount']):,.2f}"
        values["ontvangst.bedrag"] = amount.translate(str.maketrans(",.", ".,")) if language == "nl" else amount
        values["ontvangst.datum"] = formatted_date(payment["date"])
        values["ontvangst.soort"] = {
            "registration_fee": ("Inschrijfgeld", "Registration fee"), "deposit": ("Aanbetaling", "Deposit"),
            "final": ("Slotbetaling", "Final payment"), "other": ("Overig", "Other"),
        }[payment["kind"]][0 if language == "nl" else 1]
        values["ontvangst.betaalwijze"] = {
            "none": ("Niet opgegeven", "Not specified"), "bank_transfer": ("Bankoverschrijving", "Bank transfer"),
            "cash": ("Contant", "Cash"), "card": ("Pinpas", "Card"), "other": ("Overig", "Other"),
        }[payment["method"]][0 if language == "nl" else 1]
        values["ontvangst.referentie"] = payment["reference"]
        values["ontvangst.notitie"] = payment["note"]
    if not isinstance(details, dict) or set(details) - {"date", "place"}:
        raise ValueError("invalid_document_details")
    values["contract.datum"] = formatted_date(details.get("date"))
    values["contract.plaats"] = _text(details.get("place", ""), 200)
    return values


def render_text(content: str, values: dict, optional: list[str], language: str) -> str:
    def substitute(match):
        key = match[1]
        if values.get(key):
            return values[key]
        if key in optional:
            return "n.v.t." if language == "nl" else "N/A"
        return "[NIET INGEVULD]" if language == "nl" else "[MISSING]"
    return TOKEN.sub(substitute, content)
