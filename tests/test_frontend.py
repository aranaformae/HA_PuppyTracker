from pathlib import Path

from custom_components.puppy_tracker.const import DOMAIN, VERSION
from custom_components.puppy_tracker.frontend import CARD_FILES, FRONTEND_URL, _frontend_url


LOCALIZATION_BRIDGE = "puppy-tracker-localization-bridge.js"
LEGACY_LOCALIZED_CARDS = (
    "puppy-tracker-card",
    "puppy-tracker-overview-card",
    "puppy-tracker-summary-card",
    "puppy-tracker-litter-card",
    "puppy-tracker-report-card",
)


def test_frontend_route_is_versioned() -> None:
    """Frontend modules must live below a versioned path for cache safety."""
    assert FRONTEND_URL == f"/{DOMAIN}/frontend/{VERSION}"


def test_frontend_module_url_inherits_versioned_path() -> None:
    """Relative ES-module imports inherit the same release-specific base path."""
    filename = "puppy-tracker-attention-card.js"
    assert _frontend_url(filename) == f"/{DOMAIN}/frontend/{VERSION}/{filename}"


def test_localization_bridge_loads_after_dashboard_cards() -> None:
    """Legacy-card localization must run after the card modules are registered."""
    assert CARD_FILES[-1] == LOCALIZATION_BRIDGE


def test_localization_bridge_covers_all_legacy_cards() -> None:
    """Every card that still contains Dutch UI literals is handled by the bridge."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / LOCALIZATION_BRIDGE
    ).read_text(encoding="utf-8")

    for card_type in LEGACY_LOCALIZED_CARDS:
        assert f'"{card_type}"' in source
