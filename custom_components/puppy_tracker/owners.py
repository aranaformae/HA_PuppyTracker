"""Persistent owner/contact records for future puppy dossier linking."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

STORE_KEY = f"{DOMAIN}_owners"
STORE_VERSION = 1
OWNER_FIELDS = ("name", "email", "phone", "address", "notes")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize(data: dict[str, Any], *, owner_id: str | None = None, existing: dict[str, Any] | None = None) -> dict[str, Any]:
    """Normalize a contact without imposing a country-specific address format."""
    source = {**(existing or {}), **data}
    name = str(source.get("name") or "").strip()
    if not name:
        raise ValueError("name is required")
    now = _now()
    return {
        "id": owner_id or str(source.get("id") or uuid4()),
        **{field: str(source.get(field) or "").strip() or None for field in OWNER_FIELDS},
        "created_at": (existing or {}).get("created_at") or now,
        "updated_at": now,
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
                normalized = _normalize(raw, owner_id=str(owner_id))
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

    async def async_upsert(self, data: dict[str, Any], owner_id: str | None = None) -> dict[str, Any]:
        async with self._lock:
            existing = self._data["owners"].get(owner_id) if owner_id else None
            if owner_id and existing is None:
                raise ValueError("Unknown owner")
            owner = _normalize(data, owner_id=owner_id, existing=existing)
            self._data["owners"][owner["id"]] = owner
            await self._store.async_save(self._data)
            return deepcopy(owner)

    async def async_delete(self, owner_id: str) -> None:
        async with self._lock:
            if owner_id not in self._data["owners"]:
                raise ValueError("Unknown owner")
            del self._data["owners"][owner_id]
            await self._store.async_save(self._data)
