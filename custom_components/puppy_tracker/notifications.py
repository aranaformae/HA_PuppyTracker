"""Monitoring notifications for Puppy Tracker."""

from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timedelta
import logging
import re
from typing import Any

from homeassistant.components.persistent_notification import (
    async_create as async_create_persistent_notification,
    async_dismiss as async_dismiss_persistent_notification,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import CALLBACK_TYPE, HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.event import async_track_time_interval

from .care_reminders import CareReminderStore
from .const import (
    DEFAULT_NOTIFICATIONS_ENABLED,
    DEFAULT_NOTIFY_ENTITIES,
    DEFAULT_NOTIFY_RECOVERY,
    DEFAULT_NOTIFY_SESSION_COMPLETE,
    DOMAIN,
    SIGNAL_DASHBOARD_UPDATE,
    SIGNAL_UPDATE,
)
from .metrics import calculate_puppy_status
from .runtime import PuppyTrackerRuntimeData
from .session import SESSION_COMPLETED, get_session
from .storage import PuppyTrackerStorage
from .upcoming import upcoming_actions

_LOGGER = logging.getLogger(__name__)

CHECK_INTERVAL = timedelta(minutes=10)
STANDARD_CARE_REMINDER_MILESTONES: tuple[int, ...] = (7, 3, 1)


def care_reminder_thresholds(lead_days: int) -> tuple[int, ...]:
    """Return descending reminder milestones for a configured first lead time."""
    first = max(0, int(lead_days))
    if first == 0:
        return ()

    thresholds = {first}
    thresholds.update(
        milestone
        for milestone in STANDARD_CARE_REMINDER_MILESTONES
        if milestone < first
    )
    return tuple(sorted(thresholds, reverse=True))


def care_reminder_stage(days_until_due: int, lead_days: int) -> str | None:
    """Return the deduplicated care reminder stage for a due-date distance."""
    if days_until_due < 0:
        return "overdue"
    if days_until_due == 0:
        return "due_today"

    candidates = [
        threshold
        for threshold in care_reminder_thresholds(lead_days)
        if days_until_due <= threshold
    ]
    if not candidates:
        return None

    return f"upcoming:{min(candidates)}"


class PuppyNotificationManager:
    """Create deduplicated Home Assistant notifications for Puppy Tracker."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        storage: PuppyTrackerStorage,
        runtime: PuppyTrackerRuntimeData,
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
                await asyncio.sleep(0)
                if not self._rerun_requested:
                    break
        finally:
            self._pending_task = None
            if self._rerun_requested:
                self._rerun_requested = False
                self._schedule_check()

    async def async_check(self) -> None:
        """Evaluate all active puppies, sessions and dossier reminders."""
        async with self._check_lock:
            settings = self.storage.get_settings()
            enabled = bool(
                settings.get(
                    "notifications_enabled",
                    DEFAULT_NOTIFICATIONS_ENABLED,
                )
            )

            care_store = self.runtime.care_reminders

            if not enabled:
                self._dismiss_all_known_notifications()
                self._puppy_state.clear()
                self._last_session_completed_at = None
                if isinstance(care_store, CareReminderStore):
                    await care_store.async_clear_states()
                return

            notify_recovery = bool(
                settings.get("notify_recovery", DEFAULT_NOTIFY_RECOVERY)
            )
            notify_entities = list(
                settings.get(
                    "notify_entities",
                    DEFAULT_NOTIFY_ENTITIES,
                )
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
                        notify_entities=notify_entities,
                    )

            for puppy_id in set(self._puppy_state) - active_ids:
                async_dismiss_persistent_notification(
                    self.hass,
                    self._puppy_notification_id(puppy_id),
                )
                self._puppy_state.pop(puppy_id, None)

            if isinstance(care_store, CareReminderStore):
                await self._process_care_reminders(
                    care_store,
                    notify_recovery=notify_recovery,
                    notify_entities=notify_entities,
                )

            if settings.get(
                "notify_session_complete",
                DEFAULT_NOTIFY_SESSION_COMPLETE,
            ):
                await self._process_completed_session(notify_entities)

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
            title = f"Puppy Tracker · {puppy.get('name', 'Puppy')}"
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
                title = f"Puppy Tracker · {puppy.get('name', 'Puppy')}"
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

    async def _process_care_reminders(
        self,
        care_store: CareReminderStore,
        *,
        notify_recovery: bool,
        notify_entities: list[str],
    ) -> None:
        """Process due dossier actions using persistent transition state."""
        lead_days = care_store.get_lead_days()
        previous_states = care_store.get_states()
        records, contexts = self._active_care_records()
        actions = upcoming_actions(
            records,
            days_ahead=lead_days,
            include_overdue=True,
        )

        current_states: dict[str, dict[str, Any]] = {}

        for action in actions:
            category = str(action.get("record_type") or action.get("type") or "")
            if not care_store.category_enabled(category):
                continue

            try:
                days_until_due = int(action.get("days_until_due"))
            except (TypeError, ValueError):
                continue

            stage = care_reminder_stage(days_until_due, lead_days)
            if stage is None:
                continue

            state_key = self._care_state_key(action)
            source_record_id = str(action.get("source_record_id") or "")
            context = contexts.get(source_record_id, {})
            due_date = str(action.get("due_date") or action.get("due_at") or "")
            subject = self._care_subject(action, context)
            category_label = self._care_category_label(category)

            state = {
                "stage": stage,
                "due_date": due_date,
                "category": category,
                "category_label": category_label,
                "record_id": source_record_id,
                "litter_id": action.get("litter_id"),
                "puppy_id": action.get("puppy_id"),
                "subject": subject,
                "source_title": action.get("source_title"),
            }
            current_states[state_key] = state

            previous = previous_states.get(state_key)
            changed = (
                not isinstance(previous, dict)
                or previous.get("stage") != stage
                or previous.get("due_date") != due_date
            )
            if not changed:
                continue

            message = self._care_message(
                action,
                context,
                stage=stage,
                days_until_due=days_until_due,
            )
            title = f"Puppy Tracker · {category_label}"
            async_create_persistent_notification(
                self.hass,
                message,
                title=title,
                notification_id=self._care_notification_id(state_key),
            )
            await self._async_send_notify_entities(
                notify_entities,
                title,
                message,
            )

        for state_key, previous in previous_states.items():
            if state_key in current_states:
                continue

            async_dismiss_persistent_notification(
                self.hass,
                self._care_notification_id(state_key),
            )

            if not isinstance(previous, dict):
                continue
            category = str(previous.get("category") or "")
            if not care_store.category_enabled(category):
                continue
            if not notify_recovery:
                continue
            if previous.get("stage") not in {"due_today", "overdue"}:
                continue

            title = "Puppy Tracker · Zorgherinnering bijgewerkt"
            message = self._care_recovery_message(previous)
            await self._async_send_notify_entities(
                notify_entities,
                title,
                message,
            )

        await care_store.async_replace_states(current_states)

    def _active_care_records(
        self,
    ) -> tuple[list[dict[str, Any]], dict[str, dict[str, Any]]]:
        """Return active litter/puppy dossier records and display context."""
        records: list[dict[str, Any]] = []
        contexts: dict[str, dict[str, Any]] = {}

        for litter_id, litter in self.storage.get_litters().items():
            if not litter.get("active", True):
                continue

            litter_name = str(litter.get("name") or "Nest")
            for record in litter.get("records", []):
                if not isinstance(record, dict):
                    continue
                item = deepcopy(record)
                records.append(item)
                record_id = item.get("id")
                if record_id:
                    contexts[str(record_id)] = {
                        "litter_name": litter_name,
                        "puppy_name": None,
                    }

            for puppy_id, puppy in litter.get("puppies", {}).items():
                if not puppy.get("active", True):
                    continue
                puppy_name = str(puppy.get("name") or "Puppy")
                for record in puppy.get("records", []):
                    if not isinstance(record, dict):
                        continue
                    item = deepcopy(record)
                    item["litter_id"] = item.get("litter_id") or litter_id
                    item["puppy_id"] = item.get("puppy_id") or puppy_id
                    item["puppy_name"] = puppy_name
                    records.append(item)
                    record_id = item.get("id")
                    if record_id:
                        contexts[str(record_id)] = {
                            "litter_name": litter_name,
                            "puppy_name": puppy_name,
                        }

        return records, contexts

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
        title = "Puppy Tracker · Weegsessie voltooid"
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
        except Exception:
            _LOGGER.exception(
                "Unable to send Puppy Tracker notification to %s",
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

    @staticmethod
    def _care_category_label(category: str) -> str:
        """Return a concise Dutch care category label."""
        return {
            "vaccination": "Vaccinatie",
            "deworming": "Ontworming",
        }.get(category, "Verzorging")

    @staticmethod
    def _care_subject(
        action: dict[str, Any],
        context: dict[str, Any],
    ) -> str:
        """Return puppy or litter subject for a care action."""
        puppy_name = action.get("puppy_name") or context.get("puppy_name")
        if puppy_name:
            return str(puppy_name)
        return str(context.get("litter_name") or "het nest")

    def _care_message(
        self,
        action: dict[str, Any],
        context: dict[str, Any],
        *,
        stage: str,
        days_until_due: int,
    ) -> str:
        """Build a status-specific dossier care reminder."""
        category = str(action.get("record_type") or action.get("type") or "")
        category_label = self._care_category_label(category).lower()
        subject = self._care_subject(action, context)
        due_date = str(action.get("due_date") or action.get("due_at") or "")
        source_title = action.get("source_title")
        source_text = f" ({source_title})" if source_title else ""

        if stage == "due_today":
            detail = f"de {category_label} is **vandaag** aan de beurt."
        elif stage == "overdue":
            late_days = abs(days_until_due)
            unit = "dag" if late_days == 1 else "dagen"
            detail = (
                f"de {category_label} is **{late_days} {unit} te laat** "
                f"(gepland voor {due_date})."
            )
        else:
            unit = "dag" if days_until_due == 1 else "dagen"
            detail = (
                f"de {category_label} staat gepland voor **{due_date}** "
                f"(over {days_until_due} {unit})."
            )

        return f"**{subject}**{source_text}: {detail}"

    @staticmethod
    def _care_recovery_message(previous: dict[str, Any]) -> str:
        """Build a truthful resolution message without assuming why it cleared."""
        subject = str(previous.get("subject") or "De zorgherinnering")
        category_label = str(previous.get("category_label") or "Verzorging").lower()
        return (
            f"De actieve herinnering voor **{subject}** ({category_label}) is niet meer "
            "verschuldigd. De dossierplanning is bijgewerkt of de actie is afgehandeld."
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

        care_store = self.runtime.care_reminders
        if isinstance(care_store, CareReminderStore):
            for state_key in care_store.get_states():
                async_dismiss_persistent_notification(
                    self.hass,
                    self._care_notification_id(state_key),
                )

    @staticmethod
    def _care_state_key(action: dict[str, Any]) -> str:
        """Return stable deduplication key for one derived dossier action."""
        record_id = str(action.get("source_record_id") or action.get("record_id") or "")
        due_field = str(action.get("due_field") or "next_due_date")
        return f"{record_id}:{due_field}"

    @staticmethod
    def _care_notification_id(state_key: str) -> str:
        """Return a persistent-notification-safe id for a care state key."""
        safe_key = re.sub(r"[^a-zA-Z0-9_-]+", "_", state_key).strip("_")
        return f"{DOMAIN}_care_{safe_key or 'reminder'}"

    @staticmethod
    def _puppy_notification_id(puppy_id: str) -> str:
        return f"{DOMAIN}_puppy_{puppy_id}"

    @staticmethod
    def _session_notification_id(litter_id: str) -> str:
        return f"{DOMAIN}_session_{litter_id}"
