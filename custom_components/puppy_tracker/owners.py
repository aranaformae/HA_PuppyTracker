"""Persistent owner/contact records for future puppy dossier linking."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORE_KEY = f"{DOMAIN}_owners"
STORE_VERSION = 1
OWNER_FIELDS = ("name", "email", "phone", "address", "notes")
OWNER_ROLES = ("owner", "co_owner", "breeder", "veterinarian", "contact")
PLACEMENT_STATUSES = ("interested", "option", "reserved", "sold", "placed")
PAYMENT_STATUSES = ("none", "registration_fee", "deposit", "full")
CONTACT_PREFERENCES = ("none", "email", "phone", "whatsapp")
PAYMENT_METHODS = ("none", "bank_transfer", "cash", "card", "other")
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


def normalize_owner_backup_data(data: Any) -> dict[str, Any]:
    """Validate and normalize a portable owner-store snapshot."""
    if not isinstance(data, dict) or not isinstance(data.get("owners"), dict):
        raise ValueError("Owner backup owners must be an object")

    owners: dict[str, dict[str, Any]] = {}
    for key, value in data["owners"].items():
        owner_id = str(key)
        if not owner_id or not isinstance(value, dict):
            raise ValueError("Owner backup contains an invalid owner")
        owners[owner_id] = _normalize(value, owner_id=owner_id, preserve_timestamps=True)
    return {"owners": owners}


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
    """Normalize a contact without imposing a country-specific address format."""
    source = {**(existing or {}), **data}
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
    total = Decimal(amounts["payment_amount"]) if amounts["payment_amount"] is not None else None
    paid_before_final = Decimal(amounts["registration_fee_amount"] or 0) + Decimal(amounts["deposit_amount"] or 0)
    if total is not None and paid_before_final > total:
        raise ValueError("registration fee and deposit cannot exceed total amount")
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
        "status_history": normalized_history,
        "created_at": (existing or {}).get("created_at") or (source.get("created_at") if preserve_timestamps else None) or now,
        "updated_at": (source.get("updated_at") if preserve_timestamps else None) or now,
    }


class OwnerStore:
    """Store reusable owner/contact records separately from puppy data."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self._data: dict[str, Any] = {"owners": {}}
        self._lock = asyncio.Lock()

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        if not isinstance(loaded, dict) or not isinstance(loaded.get("owners"), dict):
            self._data = {"owners": {}}
            await self._store.async_save(self._data)
            return
        self._data = {"owners": {}}
        changed = False
        for owner_id, raw in loaded["owners"].items():
            if not isinstance(raw, dict):
                changed = True
                continue
            try:
                normalized = _normalize(raw, owner_id=str(owner_id), preserve_timestamps=True)
            except ValueError:
                changed = True
                continue
            self._data["owners"][normalized["id"]] = normalized
            changed = changed or normalized != raw
        if changed:
            await self._store.async_save(self._data)

    def get_all(self) -> list[dict[str, Any]]:
        return sorted((deepcopy(item) for item in self._data["owners"].values()), key=lambda item: item["name"].lower())

    def get(self, owner_id: str) -> dict[str, Any] | None:
        owner = self._data["owners"].get(owner_id)
        return deepcopy(owner) if owner else None

    def get_backup_data(self) -> dict[str, Any]:
        """Return all reusable owner records for a portable backup."""
        return {"owners": deepcopy(self._data["owners"])}

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
            if owner_id and existing is None:
                raise ValueError("Unknown owner")
            owner = _normalize(data, owner_id=owner_id, existing=existing)
            candidate = deepcopy(self._data)
            candidate["owners"][owner["id"]] = owner
            await self._store.async_save(candidate)
            self._data = candidate
            return deepcopy(owner)

    async def async_delete(self, owner_id: str) -> None:
        async with self._lock:
            if owner_id not in self._data["owners"]:
                raise ValueError("Unknown owner")
            candidate = deepcopy(self._data)
            del candidate["owners"][owner_id]
            await self._store.async_save(candidate)
            self._data = candidate
