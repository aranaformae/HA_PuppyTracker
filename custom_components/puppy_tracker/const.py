"""Constants for Puppy Tracker."""

DOMAIN = "puppy_tracker"
VERSION = "0.20.10"

STORAGE_KEY = "puppy_tracker"
STORAGE_VERSION = 1

# Monitoring defaults.
DEFAULT_MIN_DAILY_GROWTH_PERCENT = 5.0
DEFAULT_MAX_HOURS_BETWEEN_WEIGHINGS = 24.0
DEFAULT_GROWTH_MONITORING_DAYS = 14

# Notification defaults. Persistent notifications are opt-in.
DEFAULT_NOTIFICATIONS_ENABLED = False
DEFAULT_RECURRING_REMINDER_NOTIFICATIONS_ENABLED = False
DEFAULT_NOTIFY_RECOVERY = True
DEFAULT_NOTIFY_SESSION_COMPLETE = False
DEFAULT_NOTIFY_ENTITIES: tuple[str, ...] = ()
DEFAULT_NOTIFICATION_LEAD_MINUTES = 60

# First-day neonatal grace period.
FIRST_DAY_GRACE_HOURS = 24.0
FIRST_DAY_MAX_WEIGHT_LOSS_PERCENT = 10.0

# Minimum interval before growth is extrapolated to 24 hours.
MIN_GROWTH_SAMPLE_HOURS = 6.0

# Large isolated jumps are data-quality hints, not medical conclusions.
SUSPICIOUS_SINGLE_WEIGHT_CHANGE_PERCENT = 25.0
SUSTAINED_WEIGHT_LOSS_MEASUREMENTS = 2
SUSTAINED_LOW_GROWTH_SAMPLES = 2
LITTER_GROWTH_CONTEXT_TOLERANCE_PERCENT = 2.0
DEFAULT_GROWTH_MILESTONES_PERCENT = (200, 400)
DEFAULT_DOUBLE_WEIGHT_REFERENCE_DAYS = 14

# Per-litter growth analysis overrides. ``None`` means use the integration
# default; breed and size metadata are intentionally descriptive only for now.
DEFAULT_LITTER_GROWTH_ANALYSIS = {
    "breed_profile": "unknown",
    "size_class": "unknown",
    "min_daily_growth_percent": None,
    "max_hours_between_weighings": None,
    "growth_monitoring_days": None,
    "first_day_max_weight_loss_percent": None,
    "expected_adult_weight_min_grams": None,
    "expected_adult_weight_max_grams": None,
    "growth_milestones_percent": list(DEFAULT_GROWTH_MILESTONES_PERCENT),
}

# Duplicate weighing protection.
DUPLICATE_WEIGHING_WINDOW_SECONDS = 120
DUPLICATE_CONFIRMATION_SECONDS = 30

# Dispatcher signals.
SIGNAL_UPDATE = f"{DOMAIN}_update"
SIGNAL_NEW_LITTER = f"{DOMAIN}_new_litter"
SIGNAL_NEW_PUPPY = f"{DOMAIN}_new_puppy"
SIGNAL_DASHBOARD_UPDATE = f"{DOMAIN}_dashboard_update"
