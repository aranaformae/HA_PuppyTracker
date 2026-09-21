from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOSSIER = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-dossier-card.js"
TIMELINE = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-timeline-card.js"


def source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_timeline_toggle_is_large_footer_button_and_timeline_scrolls():
    text = source(TIMELINE)
    assert 'class="timeline-toggle-footer"' in text
    assert 'width:100%; min-height:48px' in text
    assert 'background:var(--primary-color)' in text
    assert 'max-height:520px; overflow-y:auto' in text
    assert 'class="timeline timeline-scroll"' in text
    assert 'this._timelineItemsVisible = this._config.show_timeline_items === true' in text


def test_dossier_uses_one_card_level_edit_mode():
    text = source(DOSSIER)
    assert 'id="toggle-dossier-manage"' in text
    assert '"Items aanpassen", "Edit items"' in text
    assert 'this._canManage && this._manageMode' in text
    assert 'if (this._manageMode) this._timelineItemsVisible = true' in text


def test_dossier_timeline_toggle_matches_timeline_card_button():
    text = source(DOSSIER)
    assert 'class="dossier-timeline-toggle-footer"' in text
    assert '.dossier-timeline-toggle-footer button{width:100%;min-height:48px' in text
    assert 'visibleRecords.length' in text
    assert 'mdi:chevron-${this._timelineItemsVisible ? "up" : "down"}' in text


def test_attention_list_has_bounded_scroll_area():
    attention = (
        ROOT
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-attention-qol.js"
    ).read_text(encoding="utf-8")
    assert ".list{max-height:520px;overflow-y:auto" in attention
    assert ".attention-ack-list{display:grid;gap:8px;margin-top:6px;max-height:520px;overflow-y:auto" in attention
