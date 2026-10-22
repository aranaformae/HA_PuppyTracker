"""Per-user setup guidance, separate from portable breeding records."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
import logging
from typing import Any

from homeassistant.helpers.storage import Store

from .const import DOMAIN
from .measurements import is_active_measurement

_LOGGER = logging.getLogger(__name__)


class OnboardingStore:
    """Persist visibility preferences and evidence of generated backups only."""

    def __init__(self, hass) -> None:
        self._store = Store(hass, 1, f"{DOMAIN}_onboarding")
        self._lock = asyncio.Lock()
        self._data: dict[str, Any] = {"users": {}, "backups": {}}

    async def async_load(self) -> None:
        stored = await self._store.async_load()
        if isinstance(stored, dict):
            self._data = {
                "users": stored.get("users") if isinstance(stored.get("users"), dict) else {},
                "backups": stored.get("backups") if isinstance(stored.get("backups"), dict) else {},
            }

    async def _commit(self, data: dict) -> None:
        await self._store.async_save(data)
        self._data = data

    async def async_set_visible(self, user_id: str, visible: bool) -> None:
        async with self._lock:
            data = deepcopy(self._data)
            data["users"][user_id] = {"visible": visible, "automatic": False}
            await self._commit(data)

    async def async_record_backup(self, litter_ids) -> None:
        """Do not turn a successful export into a failure if UI metadata cannot save."""
        try:
            async with self._lock:
                data = deepcopy(self._data)
                now = datetime.now(timezone.utc).isoformat()
                for litter_id in litter_ids:
                    data["backups"][str(litter_id)] = now
                await self._commit(data)
        except Exception:
            _LOGGER.warning("Backup succeeded, but setup progress could not be persisted", exc_info=True)

    async def async_status(self, storage, user_id: str, litter_id: str | None = None) -> dict:
        litters = storage.get_litters()
        if litter_id and litter_id not in litters:
            raise ValueError("Unknown litter")
        if not litter_id:
            litter_id = next((key for key, item in litters.items() if item.get("active", True)), next(iter(litters), None))
        litter = litters.get(litter_id, {})
        puppies = list(litter.get("puppies", {}).values())
        mother = storage.get_mother_for_litter(litter_id) if litter_id and hasattr(storage, "get_mother_for_litter") else litter.get("mother")
        steps = {
            "litter": bool(litter),
            "mother": bool(mother),
            "puppies": bool(puppies),
            "weighing": any(is_active_measurement(item) and item.get("kind") != "birth" for puppy in puppies for item in puppy.get("measurements", [])),
            "backup": bool(self._data["backups"].get(litter_id)),
        }
        complete = all(steps.values())
        async with self._lock:
            preference = self._data["users"].get(user_id)
            if not isinstance(preference, dict) or (preference.get("automatic") and complete):
                data = deepcopy(self._data)
                preference = {"visible": not litters, "automatic": not litters}
                data["users"][user_id] = preference
                await self._commit(data)
        return {
            "visible": preference.get("visible") is True,
            "complete": complete,
            "litter_id": litter_id,
            "litter_name": litter.get("name"),
            "steps": steps,
        }
