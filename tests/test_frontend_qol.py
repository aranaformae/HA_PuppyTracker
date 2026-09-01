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
    """The color layer must patch the already-defined overview card."""
    overview_index = CARD_FILES.index(OVERVIEW_CARD)
    color_index = CARD_FILES.index(COLLAR_COLORS)
    assert color_index > overview_index


def test_chart_series_use_puppy_collar_color_with_safe_fallback() -> None:
    """Chart line, points and legend must share the puppy's collar color."""
    source = (FRONTEND_DIR / COLLAR_COLORS).read_text(encoding="utf-8")

    assert "rows[index].collar" in source
    assert '.chart-line { stroke: var(--series-color) !important; }' in source
    assert '.chart-point { stroke: var(--series-color) !important; }' in source
    assert '.legend-color { background: var(--series-color) !important; }' in source
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
