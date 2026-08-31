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


def test_dossier_timeline_can_be_hidden_and_management_is_card_level() -> None:
    source = _source()

    assert 'card.__timelineItemsVisible = false' in source
    assert 'toggle-timeline-items' in source
    assert 'card.__dossierManageMode = false' in source
    assert 'manage-items-button' in source
    assert 'actions.hidden = !card.__dossierManageMode' in source
    assert 'Items aanpassen' in source
    assert 'Bewerken klaar' in source


def test_overview_chart_is_moved_after_summary() -> None:
    source = _source()

    assert 'root.querySelector(".summary-grid")' in source
    assert 'root.querySelector(".chart-panel")' in source
    assert 'summary.after(chart)' in source


def test_standalone_timeline_items_are_collapsible_and_scrollable() -> None:
    source = _source()

    assert 'function compactTimeline(card)' in source
    assert 'timeline.hidden = !card.__timelineItemsVisible' in source
    assert 'timeline-scroll' in source
    assert 'max-height:520px' in source
    assert 'buttonLabel(card, "Verberg tijdlijnitems", "Hide timeline items")' in source
    assert 'buttonLabel(card, `Toon tijdlijnitems (${count})`, `Show timeline items (${count})`)' in source
    assert 'timeline-footer-toggle' in source
