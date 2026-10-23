"""Persistent owner/contact records for future puppy dossier linking."""

from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import json
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN
from .storage_lock import CoordinatedLock, mutation_coordinator

STORE_KEY = f"{DOMAIN}_owners"
STORE_VERSION = 1
DATA_VERSION = 2
OWNER_FIELDS = (
    "name",
    "email",
    "phone",
    "street",
    "postal_code",
    "city",
    "notes",
)
OWNER_ROLES = ("owner", "co_owner", "breeder", "veterinarian", "contact")
PLACEMENT_STATUSES = ("interested", "option", "reserved", "sold", "placed")
PAYMENT_STATUSES = ("none", "registration_fee", "deposit", "full")
CONTACT_PREFERENCES = ("none", "email", "phone", "whatsapp")
PAYMENT_METHODS = ("none", "bank_transfer", "cash", "card", "other")
MAX_PUPPY_PREFERENCES = 3
PUPPY_PREFERENCE_NOTE_MAX_LENGTH = 240
AMOUNT_FIELDS = (
    "payment_amount",
    "registration_fee_amount",
    "deposit_amount",
    "payment_balance",
)
DATE_FIELDS = (
    "placement_date",
    "expected_pickup_date",
    "deposit_date",
    "payment_date",
)
PLACEMENT_FIELDS = (
    "placement_status", "payment_status", "payment_method", "puppy_preferences",
    "status_history", "placement_notes", "archived", *AMOUNT_FIELDS, *DATE_FIELDS,
)
CONTACT_FIELDS = (*OWNER_FIELDS, "role", "contact_preference", "created_at", "updated_at")


class OwnerConflict(ValueError):
    """An interactive write was based on an outdated contact snapshot."""


def owner_revision(owner: dict[str, Any]) -> str:
    """Fingerprint the complete contact without changing its portable data format."""
    return hashlib.sha256(json.dumps(owner, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def owner_response(owner: dict[str, Any]) -> dict[str, Any]:
    """Add transient concurrency metadata only at the API boundary."""
    return {**owner, "revision": owner_revision(owner)}


def normalize_owner_backup_data(data: Any, litters: dict[str, Any] | None = None) -> dict[str, Any]:
    """Validate and normalize a portable owner-store snapshot."""
    if not isinstance(data, dict) or not isinstance(data.get("owners"), dict):
        raise ValueError("Owner backup owners must be an object")
    if data.get("version", 1) not in (1, DATA_VERSION):
        raise ValueError("Unsupported owner data version")

    owners: dict[str, dict[str, Any]] = {}
    for key, value in data["owners"].items():
        owner_id = str(key)
        if not owner_id or not isinstance(value, dict):
            raise ValueError("Owner backup contains an invalid owner")
        owners[owner_id] = _normalize_contact(value, owner_id=owner_id, litters=litters)
    return {"version": DATA_VERSION, "owners": owners}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _optional_date(source: dict[str, Any], field: str) -> str | None:
    value = str(source.get(field) or "").strip() or None
    if value:
        try:
            datetime.fromisoformat(value)
        except ValueError as err:
            raise ValueError(f"{field} must be an ISO date") from err
    return value


def _decimal_text(value: Decimal) -> str:
    if value == 0:
        return "0"
    normalized = format(value, "f")
    if "." in normalized:
        normalized = normalized.rstrip("0").rstrip(".")
    return normalized or "0"


def _optional_amount(source: dict[str, Any], field: str) -> str | None:
    value = str(source.get(field) or "").strip()
    if not value:
        return None
    if "," in value and "." not in value:
        value = value.replace(",", ".")
    try:
        amount = Decimal(value)
    except InvalidOperation as err:
        raise ValueError(f"{field} must be a number") from err
    if not amount.is_finite() or amount < 0:
        raise ValueError(f"{field} must be a non-negative number")
    return _decimal_text(amount)


def _puppy_preferences(source: dict[str, Any]) -> list[dict[str, str | None]]:
    """Normalize the ordered puppy shortlist stored with an owner."""
    preferences = source.get("puppy_preferences") or []
    if not isinstance(preferences, list):
        raise ValueError("puppy_preferences must be a list")
    if len(preferences) > MAX_PUPPY_PREFERENCES:
        raise ValueError(f"puppy_preferences may contain at most {MAX_PUPPY_PREFERENCES} items")

    normalized: list[dict[str, str | None]] = []
    seen_puppy_ids: set[str] = set()
    for preference in preferences:
        if not isinstance(preference, dict):
            raise ValueError("puppy preference must be an object")
        puppy_id_value = preference.get("puppy_id")
        if not isinstance(puppy_id_value, str) or not puppy_id_value.strip():
            raise ValueError("puppy preference requires a puppy_id")
        puppy_id = puppy_id_value.strip()
        if puppy_id in seen_puppy_ids:
            raise ValueError("puppy preference puppy_id must be unique")

        note_value = preference.get("note")
        if note_value is not None and not isinstance(note_value, str):
            raise ValueError("puppy preference note must be text")
        note = (note_value or "").strip() or None
        if note and len(note) > PUPPY_PREFERENCE_NOTE_MAX_LENGTH:
            raise ValueError(
                "puppy preference note may contain at most "
                f"{PUPPY_PREFERENCE_NOTE_MAX_LENGTH} characters"
            )
        normalized.append({"puppy_id": puppy_id, "note": note})
        seen_puppy_ids.add(puppy_id)
    return normalized


def final_payment_amount(owner: dict[str, Any]) -> str | None:
    """Return total minus registration fee and deposit for one placement."""
    total_raw = owner.get("payment_amount")
    if total_raw in (None, ""):
        return None
    try:
        total = Decimal(str(total_raw))
        registration_fee = Decimal(str(owner.get("registration_fee_amount") or 0))
        deposit = Decimal(str(owner.get("deposit_amount") or 0))
    except InvalidOperation:
        return None
    if not all(value.is_finite() for value in (total, registration_fee, deposit)):
        return None
    result = total - registration_fee - deposit
    return _decimal_text(result) if result >= 0 else None


def _normalize(data: dict[str, Any], *, owner_id: str | None = None, existing: dict[str, Any] | None = None, preserve_timestamps: bool = False) -> dict[str, Any]:
    """Validate a contact/placement form, also used for legacy flat records."""
    source = {**(existing or {}), **data}
    split_address_fields = ("street", "postal_code", "city")
    if "address" in data and not any(field in data for field in split_address_fields):
        source["street"] = str(data.get("address") or "").strip() or None
    elif not any(
        str(source.get(field) or "").strip() for field in split_address_fields
    ):
        source["street"] = str(source.get("address") or "").strip() or None
    name = str(source.get("name") or "").strip()
    if not name:
        raise ValueError("name is required")
    role = str(source.get("role") or "owner").strip()
    status = str(source.get("placement_status") or "interested").strip()
    if role not in OWNER_ROLES:
        raise ValueError("unsupported owner role")
    if status not in PLACEMENT_STATUSES:
        raise ValueError("unsupported placement status")
    payment_status = str(source.get("payment_status") or "none").strip()
    if payment_status not in PAYMENT_STATUSES:
        raise ValueError("unsupported payment status")
    contact_preference = str(source.get("contact_preference") or "none").strip()
    if contact_preference not in CONTACT_PREFERENCES:
        raise ValueError("unsupported contact preference")
    payment_method = str(source.get("payment_method") or "none").strip()
    if payment_method not in PAYMENT_METHODS:
        raise ValueError("unsupported payment method")
    if not isinstance(source.get("archived", False), bool):
        raise ValueError("archived must be a boolean")
    status_history = source.get("status_history") or []
    if not isinstance(status_history, list):
        raise ValueError("status_history must be a list")
    normalized_history = [
        {"status": str(item.get("status")), "changed_at": str(item.get("changed_at"))}
        for item in status_history
        if isinstance(item, dict) and item.get("status") in PLACEMENT_STATUSES and item.get("changed_at")
    ]
    if existing and existing.get("placement_status") != status:
        normalized_history.append({"status": status, "changed_at": _now()})
    dates = {field: _optional_date(source, field) for field in DATE_FIELDS}
    amounts = {field: _optional_amount(source, field) for field in AMOUNT_FIELDS}
    puppy_preferences = _puppy_preferences(source)
    total = Decimal(amounts["payment_amount"]) if amounts["payment_amount"] is not None else None
    paid_before_final = Decimal(amounts["registration_fee_amount"] or 0) + Decimal(amounts["deposit_amount"] or 0)
    if total is not None and paid_before_final > total:
        raise ValueError("registration fee and deposit cannot exceed total amount")
    if payment_status == "full":
        amounts["payment_balance"] = "0"
    now = _now()
    return {
        "id": owner_id or str(source.get("id") or uuid4()),
        **{field: str(source.get(field) or "").strip() or None for field in OWNER_FIELDS},
        "role": role,
        "placement_status": status,
        "placement_date": dates["placement_date"],
        "expected_pickup_date": dates["expected_pickup_date"],
        "payment_status": payment_status,
        "payment_date": dates["payment_date"],
        "payment_amount": amounts["payment_amount"],
        "registration_fee_amount": amounts["registration_fee_amount"],
        "deposit_amount": amounts["deposit_amount"],
        "deposit_date": dates["deposit_date"],
        "payment_method": payment_method,
        "payment_balance": amounts["payment_balance"],
        "contact_preference": contact_preference,
        "puppy_preferences": puppy_preferences,
        "status_history": normalized_history,
        "placement_notes": str(source.get("placement_notes") or "").strip() or None,
        "archived": bool(source.get("archived", False)),
        "created_at": (existing or {}).get("created_at") or (source.get("created_at") if preserve_timestamps else None) or now,
        "updated_at": (source.get("updated_at") if preserve_timestamps else None) or now,
    }


def _placement(form: dict[str, Any]) -> dict[str, Any]:
    return {field: deepcopy(form[field]) for field in PLACEMENT_FIELDS}


def _normalize_contact(data: dict[str, Any], *, owner_id: str, litters: dict[str, Any] | None = None) -> dict[str, Any]:
    """Normalize contacts and move legacy placement data only when unambiguous."""
    if "placements" in data and any(field in data for field in PLACEMENT_FIELDS):
        raise ValueError("Placement fields must be stored in a litter dossier")
    form = _normalize(data, owner_id=owner_id, preserve_timestamps=True)
    contact = {"id": owner_id, **{field: form[field] for field in CONTACT_FIELDS}}
    if "placements" not in data:
        legacy = _placement(form)
        matches = set()
        preferred = {item["puppy_id"] for item in legacy["puppy_preferences"]}
        for litter_id, litter in (litters or {}).items():
            puppies = litter.get("puppies", {})
            for puppy in puppies.values():
                if owner_id in (puppy.get("owner_ids") or []) or puppy.get("id") in preferred:
                    matches.add(litter_id)
        contact["placements"] = {next(iter(matches)): legacy} if len(matches) == 1 else {}
        contact["unassigned_placement"] = None if len(matches) == 1 else legacy
        return contact

    if not isinstance(data["placements"], dict):
        raise ValueError("Owner placements must be an object")
    placements = {}
    for litter_id, raw in data["placements"].items():
        if not isinstance(litter_id, str) or not litter_id.strip() or not isinstance(raw, dict):
            raise ValueError("Invalid owner litter placement")
        placements[litter_id] = _placement(_normalize({"name": form["name"], **raw}, preserve_timestamps=True))
    unassigned = data.get("unassigned_placement")
    if unassigned is not None and not isinstance(unassigned, dict):
        raise ValueError("Invalid unassigned owner placement")
    contact["placements"] = placements
    contact["unassigned_placement"] = _placement(_normalize({"name": form["name"], **unassigned}, preserve_timestamps=True)) if unassigned is not None else None
    return contact


def owner_for_litter(owner: dict[str, Any], litter_id: str) -> dict[str, Any]:
    """Build an export view without leaking another litter's payment details."""
    contact = {key: value for key, value in owner.items() if key in ("id", *CONTACT_FIELDS)}
    placement = owner.get("placements", {}).get(litter_id) or {}
    return deepcopy({**contact, **placement})


def owner_address_parts(owner: dict[str, Any]) -> tuple[str | None, str | None, str | None]:
    """Return split address fields with a lossless legacy-address fallback."""
    street = str(owner.get("street") or owner.get("address") or "").strip() or None
    postal_code = str(owner.get("postal_code") or "").strip() or None
    city = str(owner.get("city") or "").strip() or None
    return street, postal_code, city


class OwnerStore:
    """Store reusable owner/contact records separately from puppy data."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self._data: dict[str, Any] = {"version": DATA_VERSION, "owners": {}}
        self._lock = CoordinatedLock(mutation_coordinator(hass))

    async def async_load(self, litters: dict[str, Any] | None = None) -> None:
        loaded = await self._store.async_load()
        candidate = normalize_owner_backup_data(loaded if loaded is not None else {"owners": {}}, litters)
        if candidate != loaded:
            await self._store.async_save(candidate)
        self._data = candidate

    def get_all(self) -> list[dict[str, Any]]:
        return sorted((deepcopy(item) for item in self._data["owners"].values()), key=lambda item: item["name"].lower())

    def get(self, owner_id: str) -> dict[str, Any] | None:
        owner = self._data["owners"].get(owner_id)
        return deepcopy(owner) if owner else None

    def get_backup_data(self) -> dict[str, Any]:
        """Return all reusable owner records for a portable backup."""
        return deepcopy(self._data)

    async def async_restore_backup_data(self, data: dict[str, Any]) -> None:
        """Atomically replace the owner store from a validated snapshot."""
        restored = normalize_owner_backup_data(data)
        async with self._lock:
            previous = deepcopy(self._data)
            self._data = restored
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                try:
                    await self._store.async_save(self._data)
                except Exception:
                    pass
                raise

    async def async_upsert(self, data: dict[str, Any], owner_id: str | None = None) -> dict[str, Any]:
        async with self._lock:
            existing = self._data["owners"].get(owner_id) if owner_id else None
            if owner_id and "expected_revision" in data:
                if existing is None or data["expected_revision"] != owner_revision(existing):
                    raise OwnerConflict("Contact changed; reload before saving")
            if owner_id and existing is None:
                raise ValueError("Unknown owner")
            litter_id = data.get("litter_id") or None
            previous_placement = (existing or {}).get("placements", {}).get(litter_id) if litter_id else (existing or {}).get("unassigned_placement")
            move = bool(data.get("move_unassigned"))
            if move:
                if not litter_id or not (existing or {}).get("unassigned_placement"):
                    raise ValueError("No unassigned placement to move")
                if previous_placement is not None:
                    raise ValueError("This contact already has a dossier for this litter")
                previous_placement = existing["unassigned_placement"]
            form = _normalize(data, owner_id=owner_id, existing={**(existing or {}), **(previous_placement or {})})
            owner = {"id": form["id"], **{field: form[field] for field in CONTACT_FIELDS},
                     "placements": deepcopy((existing or {}).get("placements", {})),
                     "unassigned_placement": deepcopy((existing or {}).get("unassigned_placement"))}
            if "litter_id" in data or any(field in data for field in PLACEMENT_FIELDS):
                if litter_id:
                    owner["placements"][litter_id] = _placement(form)
                    if move:
                        owner["unassigned_placement"] = None
                else:
                    owner["unassigned_placement"] = _placement(form)
            candidate = deepcopy(self._data)
            candidate["owners"][owner["id"]] = owner
            await self._store.async_save(candidate)
            self._data = candidate
            return deepcopy(owner)

    async def async_delete(self, owner_id: str, *, expected_revision: str | None = None) -> None:
        async with self._lock:
            existing = self._data["owners"].get(owner_id)
            if expected_revision is not None and (existing is None or expected_revision != owner_revision(existing)):
                raise OwnerConflict("Contact changed; reload before deleting")
            if owner_id not in self._data["owners"]:
                raise ValueError("Unknown owner")
            candidate = deepcopy(self._data)
            del candidate["owners"][owner_id]
            await self._store.async_save(candidate)
            self._data = candidate
