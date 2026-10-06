"""Static contracts for the per-kilogram calculator surface."""

from pathlib import Path

from custom_components.puppy_tracker.frontend import CARD_FILES


ROOT = Path(__file__).parents[1]
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend"
CARD_NAME = "puppy-tracker-calculator-card.js"
WORKSPACE_NAME = "puppy-tracker-workspace-card.js"


def test_calculator_is_an_internal_workspace_surface() -> None:
    card = (FRONTEND / CARD_NAME).read_text(encoding="utf-8")
    workspace = (FRONTEND / WORKSPACE_NAME).read_text(encoding="utf-8")

    assert CARD_NAME in CARD_FILES
    assert CARD_FILES.index(CARD_NAME) < CARD_FILES.index(WORKSPACE_NAME)
    assert 'customElements.define("puppy-tracker-calculator-card"' in card
    assert 'type: "puppy-tracker-calculator-card"' not in card
    assert 'calculator: { tag: "puppy-tracker-calculator-card"' in workspace
    assert 'care: { tabs: ["care", "calculator", "programs", "reminders"]' in workspace
    assert 'mobile: { tabs: ["weighing", "calculator"' in workspace


def test_calculator_defers_data_refresh_while_an_input_has_focus() -> None:
    card = (FRONTEND / CARD_NAME).read_text(encoding="utf-8")

    assert "if (this._inputFocused())" in card
    assert "this._refreshDeferred = true" in card
    assert "this._updateCalculations();" in card
    assert "requestLitterChange(this" in card
