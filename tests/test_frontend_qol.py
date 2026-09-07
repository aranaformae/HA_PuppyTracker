from pathlib import Path

from custom_components.puppy_tracker.frontend import CARD_FILES


FRONTEND_DIR = (
    Path(__file__).parents[1]
    / "custom_components"
    / "puppy_tracker"
    / "frontend"
)
TODAY_CARD = "puppy-tracker-today-card.js"
OVERVIEW_CARD = "puppy-tracker-overview-card.js"
COLLAR_COLORS = "puppy-tracker-collar-chart-colors.js"


def test_today_card_is_status_only_without_weighing_session_action() -> None:
    """Today must not advertise an action that cannot be completed in the card."""
    source = (FRONTEND_DIR / TODAY_CARD).read_text(encoding="utf-8")

    assert 'id="session-action"' not in source
    assert "_startSession" not in source
    assert "_findButton" not in source
    assert "Start weegsessie" not in source
    assert "Start weighing session" not in source
    assert "snelle start van de weegsessie" not in source

    # Session progress remains useful as read-only daily context.
    assert 'text(this._hass, "weighed")' in source
    assert 'text(this._hass, "remaining")' in source
    assert "remaining_puppies" in source


def test_collar_chart_color_layer_loads_after_overview_card() -> None:
    """Collar colors are imported by their owners, not loaded as a patch."""
    assert COLLAR_COLORS not in CARD_FILES
    overview = (FRONTEND_DIR / OVERVIEW_CARD).read_text(encoding="utf-8")
    assert 'import { collarColor } from "./puppy-tracker-collar-chart-colors.js";' in overview


def test_chart_series_use_puppy_collar_color_with_safe_fallback() -> None:
    """Chart line, points and legend must share the puppy's collar color."""
    source = (FRONTEND_DIR / COLLAR_COLORS).read_text(encoding="utf-8")

    overview = (FRONTEND_DIR / OVERVIEW_CARD).read_text(encoding="utf-8")
    assert "color: collarColor(row.collar, index)" in overview
    assert "--series-color:${this._escape(item.color)}" in overview
    assert "collarColor(row.collar, index)" in overview
    assert "fallbackColor" in source
    assert 'globalThis.CSS?.supports?.("color", normalized)' in source


def test_common_dutch_collar_colors_have_stable_chart_colors() -> None:
    """Common physical collar labels should not depend on puppy ordering."""
    source = (FRONTEND_DIR / COLLAR_COLORS).read_text(encoding="utf-8")

    for color_name in (
        "blauw",
        "roze",
        "groen",
        "rood",
        "geel",
        "paars",
        "oranje",
        "turquoise",
        "bruin",
        "grijs",
        "zwart",
        "wit",
    ):
        assert f'"{color_name}"' in source
