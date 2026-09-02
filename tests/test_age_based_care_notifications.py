from pathlib import Path
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from custom_components.puppy_tracker.care_notifications import _apply_notification_lead

ROOT = Path(__file__).resolve().parents[1]
CARE = ROOT / "custom_components" / "puppy_tracker" / "care_notifications.py"
RECURRING = ROOT / "custom_components" / "puppy_tracker" / "recurring_notifications.py"


def test_age_based_care_notifications_share_existing_coordinator_lifecycle() -> None:
    recurring = RECURRING.read_text(encoding="utf-8")
    assert "async_check_care_notifications" in recurring
    assert "await async_check_care_notifications(self.hass, self.runtime)" in recurring
    assert "async_clear_care_notifications(self.hass)" in recurring
    assert "async_track_time_interval" in recurring


def test_age_based_care_notifications_respect_global_and_program_switches() -> None:
    source = CARE.read_text(encoding="utf-8")
    assert 'settings.get("notifications_enabled", DEFAULT_NOTIFICATIONS_ENABLED)' in source
    assert 'program.get("notifications_enabled", True) is False' in source
    assert 'program.get("enabled", True) is False' in source
    assert 'settings.get("notify_entities", DEFAULT_NOTIFY_ENTITIES)' in source


def test_age_based_care_notifications_only_push_due_open_occurrences() -> None:
    source = CARE.read_text(encoding="utf-8")
    assert 'DUE_STATUSES = {"due_soon", "due_today", "overdue"}' in source
    assert "care_occurrence_status" in source
    assert "_apply_notification_lead(item, default_lead_minutes)" in source
    assert 'item.get("status") not in DUE_STATUSES' in source


def test_age_based_care_notifications_group_and_deduplicate_occurrences() -> None:
    source = CARE.read_text(encoding="utf-8")
    assert "scheduled_date" in source
    assert '"notified_occurrences": set()' in source
    assert "fresh_ids" in source
    assert 'state["notified_occurrences"].update(fresh_ids)' in source
    assert "puppy_names" in source
    assert "len(items)" in source


def test_age_based_care_notification_delivery_uses_shared_notify_helper() -> None:
    source = CARE.read_text(encoding="utf-8")
    assert "async_send_notify_entities" in source
    assert "normalize_notify_entities" in source
    assert "async_create_persistent_notification" in source
    assert "async_dismiss_persistent_notification" in source


def test_age_based_care_notification_lead_uses_default_and_program_override(
    monkeypatch,
) -> None:
    now = datetime(2026, 9, 2, 12, 0, tzinfo=ZoneInfo("Europe/Amsterdam"))
    monkeypatch.setattr(
        "custom_components.puppy_tracker.care_notifications.dt_util.now",
        lambda: now,
    )

    item = {
        "status": "upcoming",
        "scheduled_at": (now + timedelta(minutes=30)).isoformat(),
    }

    _apply_notification_lead(item, 20)
    assert item["status"] == "upcoming"
    assert item["minutes_until_due"] == 30

    _apply_notification_lead(item, 30)
    assert item["status"] == "due_soon"

    override = {
        "status": "upcoming",
        "scheduled_at": (now + timedelta(minutes=30)).isoformat(),
        "notification_lead_minutes": 10,
    }

    _apply_notification_lead(override, 60)
    assert override["status"] == "upcoming"
