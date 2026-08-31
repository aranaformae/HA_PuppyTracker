"""Persistent care reminder preferences and delivery state."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import DOMAIN

CARE_REMINDER_STORE_KEY = f"{DOMAIN}_care_reminders"
CARE_REMINDER_STORE_VERSION = 1

DEFAULT_CARE_REMINDER_LEAD_DAYS = 7
MAX_CARE_REMINDER_LEAD_DAYS = 30

CARE_REMINDER_CATEGORIES: tuple[str, ...] = (
    "vaccination",
    "deworming",
)


def _default_data() -> dict[str, Any]:
    """Return default reminder preferences and an empty delivery state."""
    return {
        "lead_days": DEFAULT_CARE_REMINDER_LEAD_DAYS,
        "categories": {
            category: True
            for category in CARE_REMINDER_CATEGORIES
        },
        "states": {},
    }


class CareReminderStore:
    """Store care reminder preferences and deduplication state."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(
            hass,
            CARE_REMINDER_STORE_VERSION,
            CARE_REMINDER_STORE_KEY,
        )
        self._data = _default_data()
        self._lock = asyncio.Lock()

    async def async_load(self) -> None:
        """Load and normalize care reminder settings."""
        loaded = await self._store.async_load()
        if not isinstance(loaded, dict):
            self._data = _default_data()
            await self._store.async_save(self._data)
            return

        normalized = _default_data()

        try:
            lead_days = int(loaded.get("lead_days", DEFAULT_CARE_REMINDER_LEAD_DAYS))
        except (TypeError, ValueError):
            lead_days = DEFAULT_CARE_REMINDER_LEAD_DAYS
        normalized["lead_days"] = max(
            0,
            min(MAX_CARE_REMINDER_LEAD_DAYS, lead_days),
        )

        categories = loaded.get("categories")
        if isinstance(categories, dict):
            normalized["categories"] = {
                category: bool(categories.get(category, True))
                for category in CARE_REMINDER_CATEGORIES
            }

        states = loaded.get("states")
        if isinstance(states, dict):
            normalized["states"] = {
                str(key): deepcopy(value)
                for key, value in states.items()
                if isinstance(value, dict)
            }

        self._data = normalized
        if loaded != normalized:
            await self._store.async_save(self._data)

    def get_lead_days(self) -> int:
        """Return the first reminder lead time in days."""
        return int(
            self._data.get(
                "lead_days",
                DEFAULT_CARE_REMINDER_LEAD_DAYS,
            )
        )

    def category_enabled(self, category: str) -> bool:
        """Return whether one care category may produce reminders."""
        categories = self._data.get("categories", {})
        return bool(
            isinstance(categories, dict)
            and categories.get(category, False)
        )

    def get_categories(self) -> dict[str, bool]:
        """Return all configured category toggles."""
        return {
            category: self.category_enabled(category)
            for category in CARE_REMINDER_CATEGORIES
        }

    def get_states(self) -> dict[str, dict[str, Any]]:
        """Return the persisted deduplication state."""
        states = self._data.get("states", {})
        if not isinstance(states, dict):
            return {}
        return deepcopy(states)

    async def async_set_lead_days(self, lead_days: int) -> None:
        """Set the first reminder lead time."""
        value = int(lead_days)
        if not 0 <= value <= MAX_CARE_REMINDER_LEAD_DAYS:
            raise ValueError(
                f"Care reminder lead days must be between 0 and {MAX_CARE_REMINDER_LEAD_DAYS}"
            )

        async with self._lock:
            if self._data.get("lead_days") == value:
                return
            self._data["lead_days"] = value
            await self._store.async_save(self._data)

    async def async_set_category_enabled(
        self,
        category: str,
        enabled: bool,
    ) -> None:
        """Enable or disable reminders for one care category."""
        if category not in CARE_REMINDER_CATEGORIES:
            raise ValueError(f"Unsupported care reminder category: {category}")

        async with self._lock:
            categories = self._data.setdefault("categories", {})
            value = bool(enabled)
            if categories.get(category) == value:
                return
            categories[category] = value
            await self._store.async_save(self._data)

    async def async_replace_states(
        self,
        states: dict[str, dict[str, Any]],
    ) -> None:
        """Replace persisted delivery states when they materially changed."""
        normalized = {
            str(key): deepcopy(value)
            for key, value in states.items()
            if isinstance(value, dict)
        }

        async with self._lock:
            if self._data.get("states") == normalized:
                return
            self._data["states"] = normalized
            await self._store.async_save(self._data)

    async def async_clear_states(self) -> None:
        """Clear all reminder delivery states."""
        await self.async_replace_states({})
