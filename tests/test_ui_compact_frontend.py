from pathlib import Path

from custom_components.puppy_tracker.frontend import CARD_FILES


def _source(module: str) -> str:
    return (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / module
    ).read_text(encoding="utf-8")


def test_compact_behavior_is_owned_by_affected_cards() -> None:
    assert "puppy-tracker-ui-compact.js" not in CARD_FILES


def test_dossier_timeline_can_be_hidden_and_management_is_card_level() -> None:
    source = _source("puppy-tracker-dossier-card.js")

    assert 'this._timelineItemsVisible = this._config.show_timeline_items === true' in source
    assert 'toggle-timeline-items' in source
    assert 'this._manageMode = false' in source
    assert 'manage-items-button' in source
    assert 'this._canManage && this._manageMode' in source
    assert 'Items aanpassen' in source
    assert 'Bewerken klaar' in source
    assert 'visibleRecords.length' in source


def test_overview_chart_is_moved_after_summary() -> None:
    overview = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-overview-card.js"
    ).read_text(encoding="utf-8")

    assert "_moveChartAfterSummary()" in overview
    assert 'this.shadowRoot?.querySelector(".summary-grid")' in overview
    assert 'this.shadowRoot?.querySelector(".chart-panel")' in overview
    assert "summary.after(chart)" in overview


def test_standalone_timeline_items_are_collapsible_and_scrollable() -> None:
    source = _source("puppy-tracker-timeline-card.js")

    assert 'this._timelineItemsVisible = this._config.show_timeline_items === true' in source
    assert 'class="timeline timeline-scroll"' in source
    assert 'timeline-scroll' in source
    assert 'max-height:520px' in source
    assert 'hideTimelineItems: "Hide timeline items"' in source
    assert 'showTimelineItems: "Show timeline items ({count})"' in source
    assert 'timeline-toggle-footer' in source
