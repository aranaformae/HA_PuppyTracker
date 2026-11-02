"""Stable public status vocabulary shared by care projections.

Calendar follow-ups, age-based care and timed reminders keep their own deadline
rules. In particular, due_today is a calendar/care status, whereas due_soon is a
notification lead window; open_count must not be inferred from either one.
"""

STATUS_UPCOMING = "upcoming"
STATUS_DUE_SOON = "due_soon"
STATUS_DUE_TODAY = "due_today"
STATUS_OVERDUE = "overdue"
STATUS_POSTPONED = "postponed"
STATUS_COMPLETED = "completed"
STATUS_MISSED = "missed"
STATUS_DISABLED = "disabled"

TERMINAL_CARE_STATUSES = frozenset({STATUS_COMPLETED, STATUS_MISSED})
CARE_NOTIFICATION_STATUSES = frozenset({STATUS_DUE_SOON, STATUS_DUE_TODAY, STATUS_OVERDUE})
TIMED_NOTIFICATION_STATUSES = frozenset({STATUS_DUE_SOON, STATUS_OVERDUE})
