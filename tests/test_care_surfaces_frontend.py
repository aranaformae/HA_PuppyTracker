from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend"


def test_care_surfaces_are_registered_after_base_cards() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "frontend.py").read_text()
    care = source.index('"puppy-tracker-care-surfaces.js"')
    assert source.index('"puppy-tracker-today-card.js"') < care
    assert source.index('"puppy-tracker-attention-card.js"') < care


def test_care_surfaces_use_backend_occurrence_status() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert 'type: "puppy_tracker/care_occurrences"' in source
    assert '"completed", "missed"' in source
    assert 'item?.status === "overdue"' in source
    assert 'item?.status === "due_today"' in source
    assert 'item.status === "upcoming"' in source
    assert "care_occurrence_id" not in source


def test_attention_and_today_are_both_patched() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert 'const TODAY_TAG = "puppy-tracker-today-card"' in source
    assert 'const ATTENTION_TAG = "puppy-tracker-attention-card"' in source
    assert "patchToday();" in source
    assert "patchAttention();" in source
