"""Frontend support for Puppy Tracker."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url, remove_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DOMAIN, VERSION
from .mother_dashboard_api import async_setup_mother_dashboard_api

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).parent / "frontend"
FRONTEND_BASE_URL = f"/{DOMAIN}/frontend"
# Keep the integration version in the path itself. Relative ES-module imports
# then inherit the same versioned path and cannot accidentally reuse a cached
# shared module from an older Puppy Tracker release.
FRONTEND_URL = f"{FRONTEND_BASE_URL}/{VERSION}"

CARD_FILES = (
    "puppy-tracker-card.js",
    "puppy-tracker-overview-card.js",
    # Loaded directly after the overview card so structural integration updates
    # refresh its cached Home Assistant device/entity registries before history
    # is reconciled. This keeps imported/new puppies visible without a reload.
    "puppy-tracker-overview-registry-refresh.js",
    "puppy-tracker-summary-card.js",
    "puppy-tracker-today-card.js",
    "puppy-tracker-attention-card.js",
    # Adds due generic reminders to the existing attention list.
    "puppy-tracker-recurring-attention.js",
    "puppy-tracker-recurring-reminder-card.js",
    "puppy-tracker-litter-card.js",
    # Loaded directly after the litter card. profile_note is already present in
    # puppy_tracker/data; this module only presents it in the expanded details.
    "puppy-tracker-litter-profile-note.js",
    "puppy-tracker-report-card.js",
    "puppy-tracker-dossier-card.js",
    # Adds the reusable mother owner and current/all-litter history filter to
    # the dossier card without duplicating the base dossier implementation.
    "puppy-tracker-mother-dossier.js",
    "puppy-tracker-quick-log-card.js",
    "puppy-tracker-bulk-dossier-card.js",
    "puppy-tracker-timeline-card.js",
    # Temperature was introduced after these cards already had their own type
    # lists/rendering. Keep all temperature-specific compatibility in one layer.
    "puppy-tracker-temperature-ui.js",
    # Mother support depends on the temperature layer for quick-log/timeline
    # temperature handling, so load it immediately after temperature support.
    "puppy-tracker-mother-surfaces.js",
    # Loaded after all affected cards so it can patch their rendered layout and
    # add compact show/hide and edit controls without duplicating card logic.
    "puppy-tracker-ui-compact.js",
    # Loaded last: translates the older cards that still contain Dutch UI
    # literals while Attention and Dossier use localize() directly.
    "puppy-tracker-localization-bridge.js",
)

# Static HTTP routes cannot currently be cleanly unregistered. Keep the flag
# outside hass.data[DOMAIN] and version it together with the route so a newer
# frontend can be registered safely if code is refreshed in the same process.
DATA_STATIC_PATH_REGISTERED = f"{DOMAIN}_frontend_static_path_registered_{VERSION}"


def _frontend_url(filename: str) -> str:
    """Return the versioned URL for a frontend module."""
    return f"{FRONTEND_URL}/{filename}"


async def async_setup_frontend(hass: HomeAssistant) -> None:
    """Serve and automatically load the Puppy Tracker cards."""
    async_setup_mother_dashboard_api(hass)

    if not hass.data.get(DATA_STATIC_PATH_REGISTERED):
        await hass.http.async_register_static_paths(
            [
                StaticPathConfig(
                    FRONTEND_URL,
                    str(FRONTEND_DIR),
                    False,
                )
            ]
        )
        hass.data[DATA_STATIC_PATH_REGISTERED] = True

    for filename in CARD_FILES:
        add_extra_js_url(
            hass,
            _frontend_url(filename),
        )

    _LOGGER.debug(
        "Registered Puppy Tracker frontend cards: %s",
        ", ".join(CARD_FILES),
    )


def async_unload_frontend(hass: HomeAssistant) -> None:
    """Stop automatically loading the Puppy Tracker cards."""
    for filename in CARD_FILES:
        remove_extra_js_url(
            hass,
            _frontend_url(filename),
        )
