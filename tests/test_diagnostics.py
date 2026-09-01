from types import SimpleNamespace

from custom_components.puppy_tracker.const import VERSION
from custom_components.puppy_tracker.diagnostics import (
    FRONTEND_VERSION,
    _scheduler_counts,
)


class _CarePrograms:
    def get_programs(self):
        return [{"id": "care-1"}, {"id": "care-2"}]

    def get_quarantined_program_count(self):
        return 1


class _RecurringReminders:
    def get_reminders(self):
        return [{"id": "reminder-1"}]

    def get_quarantined_reminder_count(self):
        return 2


def test_diagnostics_frontend_version_matches_release() -> None:
    """Diagnostics import must remain valid and report the active frontend release."""
    assert FRONTEND_VERSION == VERSION


def test_scheduler_diagnostics_report_counts_without_record_content() -> None:
    runtime = SimpleNamespace(
        care_programs=_CarePrograms(),
        recurring_reminders=_RecurringReminders(),
    )

    assert _scheduler_counts(runtime) == {
        "care_programs": 2,
        "quarantined_care_programs": 1,
        "recurring_reminders": 1,
        "quarantined_recurring_reminders": 2,
    }


def test_scheduler_diagnostics_tolerate_unloaded_optional_stores() -> None:
    runtime = SimpleNamespace(care_programs=None, recurring_reminders=None)

    assert _scheduler_counts(runtime) == {
        "care_programs": 0,
        "quarantined_care_programs": 0,
        "recurring_reminders": 0,
        "quarantined_recurring_reminders": 0,
    }
