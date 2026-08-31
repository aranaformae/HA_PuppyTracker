"""Notification coordinator for generic recurring reminders."""

from __future__ import annotations

import asyncio
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

from .const import DEFAULT_NOTIFICATIONS_ENABLED, DEFAULT_NOTIFY_ENTITIES, DOMAIN, SIGNAL_DASHBOARD_UPDATE
from .recurring_reminder_api import async_reconcile_recurring_reminders
from .recurring_reminders import RecurringReminderStore, reminder_status
from .runtime import PuppyTrackerRuntimeData

CHECK_INTERVAL = timedelta(minutes=10)


class RecurringReminderNotificationManager:
    """Create deduplicated notifications when generic reminders become due."""

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, runtime: PuppyTrackerRuntimeData) -> None:
        self.hass = hass
        self.entry = entry
        self.runtime = runtime
        self._unsub: list[CALLBACK_TYPE] = []
        self._task: asyncio.Task[Any] | None = None
        self._states: dict[str, tuple[str, str | None]] = {}

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
            await async_reconcile_recurring_reminders(self.hass)
            store = self.runtime.recurring_reminders
            if not isinstance(store, RecurringReminderStore):
                return
            settings = self.runtime.storage.get_settings()
            notifications_enabled = bool(settings.get("notifications_enabled", DEFAULT_NOTIFICATIONS_ENABLED))
            notify_entities = [
                value for value in settings.get("notify_entities", DEFAULT_NOTIFY_ENTITIES)
                if isinstance(value, str) and value.startswith("notify.")
            ]
            active: set[str] = set()
            for reminder in store.get_reminders():
                item = reminder_status(reminder)
                reminder_id = str(item["id"])
                if not notifications_enabled or item.get("status") not in {"due_soon", "overdue"}:
                    async_dismiss_persistent_notification(self.hass, self._notification_id(reminder_id))
                    self._states.pop(reminder_id, None)
                    continue
                active.add(reminder_id)
                state = (str(item.get("status")), item.get("next_due_at"))
                if self._states.get(reminder_id) == state:
                    continue
                self._states[reminder_id] = state
                owner = self._owner_name(item)
                message = self._message(item, owner)
                title = f"Puppy Tracker · {item.get('title') or 'Herinnering'}"
                async_create_persistent_notification(
                    self.hass,
                    message,
                    title=title,
                    notification_id=self._notification_id(reminder_id),
                )
                await self._send_mobile(notify_entities, title, message)
            for reminder_id in set(self._states) - active:
                async_dismiss_persistent_notification(self.hass, self._notification_id(reminder_id))
                self._states.pop(reminder_id, None)
        finally:
            self._task = None

    def _owner_name(self, reminder: dict[str, Any]) -> str:
        scope = reminder.get("owner_scope")
        litter_id = str(reminder.get("litter_id") or "")
        owner_id = str(reminder.get("owner_id") or "")
        if scope == "litter":
            litter = self.runtime.storage.get_litter(litter_id) or {}
            return str(litter.get("name") or "hele nest")
        if scope == "puppy":
            puppy = self.runtime.storage.get_puppy(litter_id, owner_id) or {}
            return str(puppy.get("name") or "pup")
        get_mother = getattr(self.runtime.storage, "get_mother", None)
        if scope == "mother" and callable(get_mother):
            mother = get_mother(owner_id) or {}
            return str(mother.get("name") or "moederhond")
        return owner_id

    @staticmethod
    def _message(item: dict[str, Any], owner: str) -> str:
        minutes = int(item.get("minutes_until_due") or 0)
        if item.get("status") == "overdue":
            overdue = abs(minutes)
            timing = f"{overdue} minuten te laat" if overdue < 60 else f"{overdue // 60} uur te laat"
        else:
            timing = "nu" if minutes <= 0 else f"over {minutes} minuten"
        return f"**{item.get('title', 'Actie')}** voor **{owner}** is {timing}. Log het bijpassende dossieritem om de herinnering automatisch af te ronden."

    async def _send_mobile(self, targets: list[str], title: str, message: str) -> None:
        if not targets or not self.hass.services.has_service("notify", "send_message"):
            return
        for entity_id in targets:
            try:
                await self.hass.services.async_call(
                    "notify",
                    "send_message",
                    {"entity_id": entity_id, "title": title, "message": message},
                    blocking=False,
                )
            except Exception:
                continue

    @staticmethod
    def _notification_id(reminder_id: str) -> str:
        safe = "".join(ch if ch.isalnum() else "_" for ch in reminder_id)
        return f"{DOMAIN}_recurring_{safe}"
