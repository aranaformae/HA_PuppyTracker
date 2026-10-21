from pathlib import Path

from custom_components.puppy_tracker.frontend import CARD_FILES


ROOT = Path(__file__).resolve().parents[1]
DOSSIER = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-dossier-card.js"
OVERVIEW = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-overview-card.js"


def source(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def test_compact_behavior_is_owned_by_affected_cards() -> None:
    assert "puppy-tracker-ui-compact.js" not in CARD_FILES



def test_dossier_uses_shared_item_editor_without_card_level_edit_mode():
    text = source(DOSSIER)
    assert 'id="toggle-dossier-manage"' not in text
    assert "measurementId: record.measurement_id" in text
    assert "recordEditButton(this, recordKey)" in text
    assert 'class="record-menu"' in text



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


def test_overview_chart_is_moved_after_summary() -> None:
    overview = source(OVERVIEW)

    assert "_moveChartAfterSummary()" in overview
    assert 'this.shadowRoot?.querySelector(".summary-grid")' in overview
    assert 'this.shadowRoot?.querySelector(".chart-panel")' in overview
    assert "summary.after(chart)" in overview
