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


def test_chart_navigation_is_imported_by_the_overview_card() -> None:
    """Chart navigation is a direct dependency, not a late prototype patch."""
    overview = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / OVERVIEW_CARD
    ).read_text(encoding="utf-8")

    assert OVERVIEW_CARD in CARD_FILES
    assert COLLAR_CHART_COLORS not in CARD_FILES
    assert OVERVIEW_REGISTRY_REFRESH not in CARD_FILES
    assert CHART_TIME_NAVIGATION not in CARD_FILES
    assert f'from "./{CHART_TIME_NAVIGATION}"' in overview
    assert "chartMetricPoints.call(this, row)" in overview
    assert "chartSvg.call(this, rows)" in overview
    assert ".prototype" not in _source()


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


def test_chart_navigation_preserves_puppy_collar_colors() -> None:
    """The alternate SVG renderer must pass the resolved series color through."""
    source = _source()

    assert '--series-color:${this._escape(item.color)}' in source
    assert source.count('--series-color:${this._escape(item.color)}') == 2
