from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CARD = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-temperature-card.js"
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend.py"


def test_temperature_card_is_registered_and_exposes_expected_controls() -> None:
    source = CARD.read_text(encoding="utf-8")
    frontend = FRONTEND.read_text(encoding="utf-8")
    assert '"puppy-tracker-temperature-card.js"' in frontend
    assert 'customElements.define("puppy-tracker-temperature-card"' in source
    assert 'type: "puppy-tracker-temperature-card"' in source
    assert 'id="scope-select"' in source
    assert 'id="puppy-select"' in source
    assert 'id="range-select"' in source
    assert 'id="temperature-value"' in source
    assert 'id="temperature-note"' in source


def test_temperature_card_uses_explicit_owner_endpoints_and_structured_data() -> None:
    source = CARD.read_text(encoding="utf-8")
    assert 'type: "puppy_tracker/mother/records"' in source
    assert 'type: "puppy_tracker/mother/record/add"' in source
    assert 'record_type: "temperature"' in source
    assert "temperature_c: value" in source
    assert "addDossierRecord" in source
    assert "temperatureRecords" in source


def test_temperature_card_has_scrollable_history_and_svg_chart() -> None:
    source = CARD.read_text(encoding="utf-8")
    assert "max-height:" in source
    assert "overflow:auto" in source
    assert "<svg viewBox=" in source
    assert "role=\"img\"" in source
