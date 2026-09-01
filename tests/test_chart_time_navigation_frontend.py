from pathlib import Path

from custom_components.puppy_tracker.frontend import CARD_FILES


CHART_TIME_NAVIGATION = "puppy-tracker-chart-time-navigation.js"
OVERVIEW_CARD = "puppy-tracker-overview-card.js"
OVERVIEW_REGISTRY_REFRESH = "puppy-tracker-overview-registry-refresh.js"
COLLAR_CHART_COLORS = "puppy-tracker-collar-chart-colors.js"


def _source() -> str:
    return (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / CHART_TIME_NAVIGATION
    ).read_text(encoding="utf-8")


def test_chart_navigation_loads_after_overview_and_before_color_patch() -> None:
    """Chart navigation must patch the overview before collar colors wrap render."""
    overview_index = CARD_FILES.index(OVERVIEW_CARD)
    registry_index = CARD_FILES.index(OVERVIEW_REGISTRY_REFRESH)
    navigation_index = CARD_FILES.index(CHART_TIME_NAVIGATION)
    color_index = CARD_FILES.index(COLLAR_CHART_COLORS)

    assert overview_index < registry_index < navigation_index < color_index


def test_chart_ranges_are_viewports_not_history_filters() -> None:
    """Older valid points must remain available for horizontal navigation."""
    source = _source()

    assert "point.time <= now + FUTURE_TOLERANCE_MS" in source
    assert "point.time >=" not in source
    assert "overflow-x: auto" in source
    assert "data-visible-ms" in source


def test_chart_navigation_exposes_now_marker_and_return_action() -> None:
    """The current instant must be visible and directly recoverable."""
    source = _source()

    assert 'class="chart-now-line"' in source
    assert 'class="chart-now-label"' in source
    assert 'class="chart-back-now"' in source
    assert "_chartScrollToNowPending" in source
