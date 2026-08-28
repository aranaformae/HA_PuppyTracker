"""Monitoring notifications for Puppy Weight Tracker."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta
import logging
from typing import Any

from homeassistant.components.persistent_notification import (
    async_create as async_create_persistent_notification,
    async_dismiss as async_dismiss_persistent_notification,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_track_time_interval

from .const import (
    DEFAULT_NOTIFICATIONS_ENABLED,
    DEFAULT_NOTIFY_RECOVERY,
    DEFAULT_NOTIFY_SESSION_COMPLETE,
    DEFAULT_NOTIFY_ENTITIES,
    DOMAIN,
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_UPDATE,
)
from .sensor import calculate_puppy_status
from .session import SESSION_COMPLETED, get_session
from .storage import PuppyWeightStorage

_LOGGER = logging.getLogger(__name__)

CHECK_INTERVAL = timedelta(minutes=10)


class PuppyNotificationManager:
    """Create deduplicated Home Assistant notifications for puppy monitoring."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        storage: PuppyWeightStorage,
        runtime: dict[str, Any],
    ) -> None:
        self.hass = hass
        self.entry = entry
        self.storage = storage
        self.runtime = runtime
        self._unsub: list[CALLBACK_TYPE] = []
        self._check_lock = asyncio.Lock()
        self._pending_task: asyncio.Task[Any] | None = None
        self._rerun_requested = False
        self._puppy_state: dict[str, dict[str, Any]] = {}
        self._last_session_completed_at: str | None = None

    async def async_start(self) -> None:
        """Start monitoring."""
        self._unsub.append(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_UPDATE,
                self._handle_signal,
            )
        )
        self._unsub.append(
            async_dispatcher_connect(
                self.hass,
                SIGNAL_DASHBOARD_UPDATE,
                self._handle_signal,
            )
        )
        self._unsub.append(
            async_track_time_interval(
                self.hass,
                self._handle_interval,
                CHECK_INTERVAL,
            )
        )
        self._schedule_check()

    async def async_stop(self) -> None:
        """Stop monitoring callbacks."""
        for unsub in self._unsub:
            unsub()
        self._unsub.clear()

        if self._pending_task is not None and not self._pending_task.done():
            self._pending_task.cancel()
        self._pending_task = None
        self._rerun_requested = False

    @callback
    def _handle_signal(self, *args: Any) -> None:
        self._schedule_check()

    @callback
    def _handle_interval(self, now: datetime) -> None:
        self._schedule_check()

    @callback
    def _schedule_check(self) -> None:
        """Schedule a check without losing changes that arrive mid-check."""
        if self._pending_task is not None and not self._pending_task.done():
            self._rerun_requested = True
            return

        self._pending_task = self.hass.async_create_task(
            self._async_check_runner()
        )

    async def _async_check_runner(self) -> None:
        """Run checks until all coalesced state changes are evaluated."""
        try:
            while True:
                self._rerun_requested = False
                await self.async_check()
                # Give dispatcher callbacks queued in the same event-loop turn a
                # chance to request one more evaluation.
                await asyncio.sleep(0)
                if not self._rerun_requested:
                    break
        finally:
            self._pending_task = None
            # Cover the narrow race where a callback requested a rerun between
            # the loop condition above and task finalization.
            if self._rerun_requested:
                self._rerun_requested = False
                self._schedule_check()

    async def async_check(self) -> None:
        """Evaluate all active puppies and update notifications."""
        async with self._check_lock:
            settings = self.storage.get_settings()
            enabled = bool(
                settings.get(
                    "notifications_enabled",
                    DEFAULT_NOTIFICATIONS_ENABLED,
                )
            )

            if not enabled:
                self._dismiss_all_known_notifications()
                self._puppy_state.clear()
                self._last_session_completed_at = None
                return

            notify_recovery = bool(
                settings.get("notify_recovery", DEFAULT_NOTIFY_RECOVERY)
            )
            active_ids: set[str] = set()

            for litter_id, litter in self.storage.get_litters().items():
                if not litter.get("active", True):
                    continue

                for puppy_id, puppy in litter.get("puppies", {}).items():
                    if not puppy.get("active", True):
                        continue

                    active_ids.add(puppy_id)
                    status = calculate_puppy_status(
                        self.storage,
                        litter_id,
                        puppy_id,
                    )
                    await self._process_puppy_status(
                        litter_id,
                        puppy_id,
                        puppy,
                        status,
                        notify_recovery=notify_recovery,
                        notify_entities=list(
                            settings.get(
                                "notify_entities",
                                DEFAULT_NOTIFY_ENTITIES,
                            )
                        ),
                    )

            for puppy_id in set(self._puppy_state) - active_ids:
                async_dismiss_persistent_notification(
                    self.hass,
                    self._puppy_notification_id(puppy_id),
                )
                self._puppy_state.pop(puppy_id, None)

            if settings.get(
                "notify_session_complete",
                DEFAULT_NOTIFY_SESSION_COMPLETE,
            ):
                await self._process_completed_session(
                    list(
                        settings.get(
                            "notify_entities",
                            DEFAULT_NOTIFY_ENTITIES,
                        )
                    )
                )

    async def _process_puppy_status(
        self,
        litter_id: str,
        puppy_id: str,
        puppy: dict[str, Any],
        status: dict[str, Any],
        *,
        notify_recovery: bool,
        notify_entities: list[str],
    ) -> None:
        """Update one puppy notification without repeating unchanged alerts."""
        previous = self._puppy_state.get(puppy_id)
        needs_attention = bool(status.get("needs_attention"))
        status_code = str(status.get("status_code") or "unknown")

        changed_to_attention = needs_attention and (
            previous is None
            or not previous.get("needs_attention", False)
            or previous.get("status_code") != status_code
        )

        if changed_to_attention:
            message = self._attention_message(puppy, status)
            title = f"Puppy Weight Tracker · {puppy.get('name', 'Puppy')}"
            async_create_persistent_notification(
                self.hass,
                message,
                title=title,
                notification_id=self._puppy_notification_id(puppy_id),
            )
            await self._async_send_notify_entities(
                notify_entities,
                title,
                message,
            )

        if (
            not needs_attention
            and previous is not None
            and previous.get("needs_attention", False)
        ):
            if notify_recovery:
                message = self._recovery_message(puppy, status)
                title = f"Puppy Weight Tracker · {puppy.get('name', 'Puppy')}"
                async_create_persistent_notification(
                    self.hass,
                    message,
                    title=title,
                    notification_id=self._puppy_notification_id(puppy_id),
                )
                await self._async_send_notify_entities(
                    notify_entities,
                    title,
                    message,
                )
            else:
                async_dismiss_persistent_notification(
                    self.hass,
                    self._puppy_notification_id(puppy_id),
                )

        self._puppy_state[puppy_id] = {
            "litter_id": litter_id,
            "needs_attention": needs_attention,
            "status_code": status_code,
        }

    async def _process_completed_session(
        self,
        notify_entities: list[str],
    ) -> None:
        """Create one notification when the current weighing session completes."""
        session = get_session(self.runtime)
        if session.get("status") != SESSION_COMPLETED:
            return

        completed_at = session.get("completed_at")
        if not completed_at or completed_at == self._last_session_completed_at:
            return

        litter_id = session.get("litter_id")
        if not litter_id:
            return

        litter = self.storage.get_litter(litter_id) or {}
        weighed = len(session.get("weighed_puppy_ids", []))
        total = len(session.get("puppy_ids", []))

        message = (
            f"De weegsessie voor **{litter.get('name', 'het nest')}** "
            f"is voltooid. **{weighed}/{total}** pups zijn gewogen."
        )
        title = "Puppy Weight Tracker · Weegsessie voltooid"
        async_create_persistent_notification(
            self.hass,
            message,
            title=title,
            notification_id=self._session_notification_id(litter_id),
        )
        await self._async_send_notify_entities(
            notify_entities,
            title,
            message,
        )
        self._last_session_completed_at = str(completed_at)


    async def _async_send_notify_entities(
        self,
        notify_entities: list[str],
        title: str,
        message: str,
    ) -> None:
        """Send the same deduplicated event to configured notify entities."""
        targets = [
            entity_id
            for entity_id in notify_entities
            if isinstance(entity_id, str) and entity_id.startswith("notify.")
        ]
        if not targets or not self.hass.services.has_service(
            "notify",
            "send_message",
        ):
            return

        try:
            await self.hass.services.async_call(
                "notify",
                "send_message",
                {
                    "title": title,
                    "message": message.replace("**", ""),
                },
                blocking=False,
                target={"entity_id": targets},
            )
        except Exception:  # Notifications must never break weighing.
            _LOGGER.exception(
                "Unable to send Puppy Weight Tracker notification to %s",
                ", ".join(targets),
            )

    @staticmethod
    def _attention_message(
        puppy: dict[str, Any],
        status: dict[str, Any],
    ) -> str:
        """Build a concise status-specific warning message."""
        name = puppy.get("name", "Puppy")
        code = status.get("status_code")

        if code == "no_measurement":
            detail = "er is nog geen geldige gewichtsmeting beschikbaar."
        elif code == "weigh_due":
            hours = status.get("hours_since_weighing")
            limit = status.get("max_hours_between_weighings")
            detail = (
                f"de laatste weging is {hours} uur geleden; "
                f"de ingestelde grens is {limit} uur."
            )
        elif code == "first_day_excess_weight_loss":
            change = status.get("first_day_weight_change_percent")
            detail = (
                f"het gewicht is {change}% veranderd ten opzichte van het "
                "geboortegewicht binnen de eerste 24 uur."
            )
        elif code == "weight_loss":
            detail = "het huidige gewicht is lager dan bij de vorige geldige meting."
        elif code == "low_growth":
            growth = status.get("daily_growth_percent")
            minimum = status.get("min_daily_growth_percent")
            detail = (
                f"de genormaliseerde groei is {growth}% per 24 uur; "
                f"de ingestelde ondergrens is {minimum}%."
            )
        else:
            detail = f"de monitoringstatus is **{status.get('status', 'Aandacht')}**."

        collar = puppy.get("collar_color")
        collar_text = f" (halsband {collar})" if collar else ""
        return f"**{name}{collar_text}** vraagt aandacht: {detail}"

    @staticmethod
    def _recovery_message(
        puppy: dict[str, Any],
        status: dict[str, Any],
    ) -> str:
        name = puppy.get("name", "Puppy")
        return (
            f"**{name}** heeft geen actieve gewichtswaarschuwing meer. "
            f"Huidige status: **{status.get('status', 'OK')}**."
        )

    def _dismiss_all_known_notifications(self) -> None:
        """Dismiss integration notifications when notifications are disabled."""
        for litter_id, litter in self.storage.get_litters().items():
            async_dismiss_persistent_notification(
                self.hass,
                self._session_notification_id(litter_id),
            )
            for puppy_id in litter.get("puppies", {}):
                async_dismiss_persistent_notification(
                    self.hass,
                    self._puppy_notification_id(puppy_id),
                )

    @staticmethod
    def _puppy_notification_id(puppy_id: str) -> str:
        return f"{DOMAIN}_puppy_{puppy_id}"

    @staticmethod
    def _session_notification_id(litter_id: str) -> str:
        return f"{DOMAIN}_session_{litter_id}"
