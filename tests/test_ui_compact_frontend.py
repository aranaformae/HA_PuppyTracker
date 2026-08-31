from pathlib import Path

from custom_components.puppy_tracker.frontend import CARD_FILES


MODULE = "puppy-tracker-ui-compact.js"


def _source() -> str:
    return (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / MODULE
    ).read_text(encoding="utf-8")


def test_compact_module_loads_after_affected_cards() -> None:
    assert MODULE in CARD_FILES
    assert CARD_FILES.index(MODULE) > CARD_FILES.index("puppy-tracker-dossier-card.js")
    assert CARD_FILES.index(MODULE) > CARD_FILES.index("puppy-tracker-timeline-card.js")
    assert CARD_FILES.index(MODULE) > CARD_FILES.index("puppy-tracker-overview-card.js")


def test_dossier_timeline_can_be_hidden_and_management_is_opt_in() -> None:
    source = _source()

    assert 'card.__timelineItemsVisible = false' in source
    assert 'toggle-timeline-items' in source
    assert 'actions.hidden = !record.classList.contains("manage-open")' in source
    assert 'record-manage-toggle' in source
    assert 'record.classList.toggle("manage-open")' in source


def test_overview_chart_is_moved_after_summary() -> None:
    source = _source()

    assert 'root.querySelector(".summary-grid")' in source
    assert 'root.querySelector(".chart-panel")' in source
    assert 'summary.after(chart)' in source


def test_standalone_timeline_items_are_collapsible() -> None:
    source = _source()

    assert 'function compactTimeline(card)' in source
    assert 'timeline.hidden = !card.__timelineItemsVisible' in source
    assert 'buttonLabel(card, "Verberg items", "Hide items")' in source
    assert 'buttonLabel(card, "Toon items", "Show items")' in source
