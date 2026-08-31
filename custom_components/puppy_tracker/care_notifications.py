"""Notification coordinator for age-based litter care occurrences."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any

from homeassistant.components.persistent_notification import (
    async_create as async_create_persistent_notification,
    async_dismiss as async_dismiss_persistent_notification,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_track_time_interval

from .care_occurrences import derive_litter_care_occurrences
from .care_programs import AgeBasedCareProgramStore
from .care_status import care_occurrence_status
from .const import DEFAULT_NOTIFICATIONS_ENABLED, DEFAULT_NOTIFY_ENTITIES, DOMAIN, SIGNAL_DASHBOARD_UPDATE
from .notification_delivery import async_send_notify_entities, normalize_notify_entities
from .runtime import PuppyTrackerRuntimeData

CHECK_INTERVAL = timedelta(minutes=10)
DUE_STATUSES = {"due_today", "overdue"}


class CareProgramNotificationManager:
    """Send grouped, deduplicated notifications for age-based care actions."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, runtime: PuppyTrackerRuntimeData) -> None:
        self.hass = hass
        self.entry = entry
        self.runtime = runtime
        self._unsub: list[CALLBACK_TYPE] = []
        self._task: asyncio.Task[Any] | None = None
        self._notified_occurrences: set[str] = set()
        self._active_groups: set[str] = set()

    async def async_start(self) -> None:
        self._unsub.append(async_dispatcher_connect(self.hass, SIGNAL_DASHBOARD_UPDATE, self._handle_signal))
        self._unsub.append(async_track_time_interval(self.hass, self._handle_interval, CHECK_INTERVAL))
        self._schedule()

    async def async_stop(self) -> None:
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()
        if self._task is not None and not self._task.done():
            self._task.cancel()
        self._task = None

    @callback
    def _handle_signal(self, *args: Any) -> None:
        self._schedule()

    @callback
    def _handle_interval(self, now: datetime) -> None:
        self._schedule()

    @callback
    def _schedule(self) -> None:
        if self._task is not None and not self._task.done():
            return
        self._task = self.hass.async_create_task(self.async_check())

    async def async_check(self) -> None:
        try:
            store = self.runtime.care_programs
            if not isinstance(store, AgeBasedCareProgramStore):
                return
            settings = self.runtime.storage.get_settings()
            globally_enabled = bool(settings.get("notifications_enabled", DEFAULT_NOTIFICATIONS_ENABLED))
            notify_entities = normalize_notify_entities(settings.get("notify_entities", DEFAULT_NOTIFY_ENTITIES))

            groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for program in store.get_programs():
                if not globally_enabled or program.get("enabled", True) is False or program.get("notifications_enabled", True) is False:
                    continue
                litter_id = str(program.get("litter_id") or "")
                litter = self.runtime.storage.get_litter(litter_id) or {}
                puppies = [p for p in (litter.get("puppies") or {}).values() if isinstance(p, dict) and p.get("active", True) is not False]
                for puppy in puppies:
                    try:
                        derived = derive_litter_care_occurrences(program, [puppy])
                    except ValueError:
                        continue
                    records = self.runtime.storage.get_records(litter_id, str(puppy.get("id") or ""), newest_first=False)
                    for occurrence in derived:
                        item = care_occurrence_status(occurrence, records)
                        if item.get("status") not in DUE_STATUSES:
                            continue
                        scheduled_date = str(item.get("scheduled_at") or "")[:10]
                        key = f"{item.get('program_id')}:{item.get('age_days')}:{scheduled_date}"
                        groups[key].append(item)

            active_groups = set(groups)
            for stale in self._active_groups - active_groups:
                async_dismiss_persistent_notification(self.hass, self._notification_id(stale))
            self._active_groups = active_groups

            for key, items in groups.items():
                items.sort(key=lambda item: str(item.get("puppy_name") or ""))
                title = f"Puppy Tracker · {items[0].get('title') or 'Zorgprogramma'}"
                message = self._message(items)
                async_create_persistent_notification(
                    self.hass,
                    message,
                    title=title,
                    notification_id=self._notification_id(key),
                )

                fresh_ids = [str(item.get("id") or "") for item in items if str(item.get("id") or "") not in self._notified_occurrences]
                if fresh_ids:
                    await async_send_notify_entities(self.hass, notify_entities, title, message)
                    self._notified_occurrences.update(fresh_ids)

            open_ids = {str(item.get("id") or "") for items in groups.values() for item in items}
            self._notified_occurrences.intersection_update(open_ids)
        finally:
            self._task = None

    @staticmethod
    def _message(items: list[dict[str, Any]]) -> str:
        first = items[0]
        status = str(first.get("status") or "")
        age_days = int(first.get("age_days") or 0)
        puppy_names = [str(item.get("puppy_name") or "Pup") for item in items]
        timing = "is vandaag aan de beurt" if status == "due_today" else "is achterstallig"
        if len(items) == 1:
            return f"**{first.get('title', 'Zorgactie')} · dag {age_days}** voor **{puppy_names[0]}** {timing}. Open Today of Aandacht om het resultaat vast te leggen."
        return f"**{first.get('title', 'Zorgactie')} · dag {age_days}** {timing} voor **{len(items)} pups**: {', '.join(puppy_names)}. Open Today of Aandacht om resultaten vast te leggen."

    @staticmethod
    def _notification_id(group_key: str) -> str:
        safe = "".join(ch if ch.isalnum() else "_" for ch in group_key)
        return f"{DOMAIN}_care_{safe}"
