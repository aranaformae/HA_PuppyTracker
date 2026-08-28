"""Frontend support for Puppy Weight Tracker."""

from __future__ import annotations

import logging
from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url, remove_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

from .const import DOMAIN

_LOGGER = logging.getLogger(__name__)

FRONTEND_DIR = Path(__file__).parent / "frontend"
FRONTEND_URL = f"/{DOMAIN}/frontend"
FRONTEND_VERSION = "0.8.0"

CARD_FILES = (
    "puppy-weight-tracker-card.js",
    "puppy-weight-overview-card.js",
)

# Static HTTP routes cannot currently be cleanly unregistered. Keep this flag
# outside hass.data[DOMAIN] so an integration reload does not register the same
# route a second time.
DATA_STATIC_PATH_REGISTERED = f"{DOMAIN}_frontend_static_path_registered"


def _frontend_url(filename: str) -> str:
    """Return the cache-busted URL for a frontend module."""
    return f"{FRONTEND_URL}/{filename}?v={FRONTEND_VERSION}"


async def async_setup_frontend(hass: HomeAssistant) -> None:
    """Serve and automatically load the Puppy Weight Tracker cards."""
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
        "Registered Puppy Weight Tracker frontend cards: %s",
        ", ".join(CARD_FILES),
    )


def async_unload_frontend(hass: HomeAssistant) -> None:
    """Stop automatically loading the Puppy Weight Tracker cards."""
    for filename in CARD_FILES:
        remove_extra_js_url(
            hass,
            _frontend_url(filename),
        )
