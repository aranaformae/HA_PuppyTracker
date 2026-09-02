from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-ui-compact.js"


def source() -> str:
    return UI.read_text(encoding="utf-8")


def test_timeline_toggle_is_large_footer_button_and_timeline_scrolls():
    text = source()
    assert 'className = "timeline-toggle-footer"' in text
    assert 'width:100%;min-height:48px' in text
    assert 'background:var(--primary-color)' in text
    assert 'max-height:520px;overflow-y:auto' in text
    assert 'timeline.classList.toggle("timeline-scroll", card.__timelineItemsVisible)' in text
    assert 'card.__timelineItemsVisible = card._config?.show_timeline_items === true' in text


def test_dossier_uses_one_card_level_edit_mode():
    text = source()
    assert 'id = "toggle-dossier-manage"' in text
    assert 'buttonLabel(card, "Items aanpassen", "Edit items")' in text
    assert 'actions.hidden = !card.__dossierManageMode' in text
    assert 'record.querySelector(".record-manage-toggle")?.remove()' in text
    assert 'if (card.__dossierManageMode) card.__timelineItemsVisible = true' in text


def test_dossier_timeline_toggle_matches_timeline_card_button():
    text = source()
    assert 'className = "dossier-timeline-toggle-footer"' in text
    assert '.dossier-timeline-toggle-footer button{width:100%;min-height:48px' in text
    assert 'const count = dossierVisibleRecordCount(card, timeline)' in text
    assert 'mdi:chevron-up' in text
    assert 'mdi:chevron-down' in text
