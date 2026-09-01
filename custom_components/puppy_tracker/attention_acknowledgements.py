"""Persistent acknowledgement state for derived Attention items."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import DOMAIN

STORE_KEY = f"{DOMAIN}_attention_acknowledgements"
STORE_VERSION = 1


class AttentionAcknowledgementStore:
    """Persist acknowledgement state without changing authoritative care data."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(hass, STORE_VERSION, STORE_KEY)
        self._data: dict[str, Any] = {"litters": {}}
        self._lock = asyncio.Lock()

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        litters = loaded.get("litters", {}) if isinstance(loaded, dict) else {}
        normalized: dict[str, dict[str, dict[str, str]]] = {}
        if isinstance(litters, dict):
            for litter_id, values in litters.items():
                if not isinstance(values, dict):
                    continue
                current: dict[str, dict[str, str]] = {}
                for attention_id, metadata in values.items():
                    if not isinstance(attention_id, str) or not attention_id:
                        continue
                    acknowledged_at = (
                        str(metadata.get("acknowledged_at") or "")
                        if isinstance(metadata, dict)
                        else ""
                    )
                    if acknowledged_at:
                        current[attention_id] = {"acknowledged_at": acknowledged_at}
                if current:
                    normalized[str(litter_id)] = current
        self._data = {"litters": normalized}

    def get_acknowledgements(self, litter_id: str) -> dict[str, dict[str, str]]:
        """Return acknowledgement metadata for one litter."""
        values = self._data.get("litters", {}).get(str(litter_id), {})
        return deepcopy(values) if isinstance(values, dict) else {}

    def is_acknowledged(self, litter_id: str, attention_id: str) -> bool:
        """Return whether one derived Attention item is acknowledged."""
        return attention_id in self._data.get("litters", {}).get(str(litter_id), {})

    async def async_set(self, litter_id: str, attention_id: str, acknowledged: bool) -> None:
        """Acknowledge or unacknowledge one Attention item atomically."""
        litter_id = str(litter_id or "").strip()
        attention_id = str(attention_id or "").strip()
        if not litter_id:
            raise ValueError("litter_id is required")
        if not attention_id:
            raise ValueError("attention_id is required")

        async with self._lock:
            previous = deepcopy(self._data)
            litters = self._data.setdefault("litters", {})
            values = litters.setdefault(litter_id, {})
            if acknowledged:
                values[attention_id] = {"acknowledged_at": dt_util.now().isoformat()}
            else:
                values.pop(attention_id, None)
                if not values:
                    litters.pop(litter_id, None)
            try:
                await self._store.async_save(self._data)
            except Exception:
                self._data = previous
                raise
