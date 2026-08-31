from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_options_flow_uses_central_notification_settings_mixin() -> None:
    source = _read("custom_components/puppy_tracker/config_flow.py")
    flow = _read("custom_components/puppy_tracker/notification_settings_flow.py")

    assert "NotificationSettingsMixin" in source
    assert '"recurring_reminder_notifications_enabled"' in flow
    assert '"notifications_enabled"' in flow
    assert '"notify_recovery"' in flow
    assert '"notify_session_complete"' in flow
    assert '"notify_entities"' in flow
    assert '"send_test_notification"' in flow


def test_test_notification_does_not_touch_reminder_state() -> None:
    source = _read("custom_components/puppy_tracker/notification_settings_flow.py")

    method = source.split("async def _async_send_test_notification", 1)[1].split(
        "async def async_step_settings", 1
    )[0]
    assert "recurring_reminders" not in method
    assert "last_completed_at" not in method
    assert "last_completed_record_id" not in method
    assert "async_mark_completed" not in method
    assert "async_match_record" not in method
    assert "puppy_tracker_notification_test" in method


def test_recurring_notifications_have_independent_toggle() -> None:
    source = _read("custom_components/puppy_tracker/recurring_notifications.py")
    const = _read("custom_components/puppy_tracker/const.py")

    assert "DEFAULT_RECURRING_REMINDER_NOTIFICATIONS_ENABLED" in const
    assert '"recurring_reminder_notifications_enabled"' in source
    assert 'settings.get("notifications_enabled"' not in source
