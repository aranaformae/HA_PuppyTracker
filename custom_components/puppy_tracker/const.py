"""Constants for Puppy Tracker."""

DOMAIN = "puppy_tracker"
VERSION = "0.20.2"

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

# First-day neonatal grace period.
FIRST_DAY_GRACE_HOURS = 24.0
FIRST_DAY_MAX_WEIGHT_LOSS_PERCENT = 10.0

# Minimum interval before growth is extrapolated to 24 hours.
MIN_GROWTH_SAMPLE_HOURS = 6.0

# Duplicate weighing protection.
DUPLICATE_WEIGHING_WINDOW_SECONDS = 120
DUPLICATE_CONFIRMATION_SECONDS = 30

# Dispatcher signals.
SIGNAL_UPDATE = f"{DOMAIN}_update"
SIGNAL_NEW_LITTER = f"{DOMAIN}_new_litter"
SIGNAL_NEW_PUPPY = f"{DOMAIN}_new_puppy"
SIGNAL_DASHBOARD_UPDATE = f"{DOMAIN}_dashboard_update"
