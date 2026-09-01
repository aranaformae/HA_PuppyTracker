from pathlib import Path

from custom_components.puppy_tracker.frontend import CARD_FILES


WEIGHING_CARD = "puppy-tracker-card.js"
WEIGHING_FEEDBACK = "puppy-tracker-weighing-feedback.js"


def test_weighing_feedback_loads_directly_after_weighing_card() -> None:
    """The feedback layer must patch the weighing card before later UI patches."""
    card_index = CARD_FILES.index(WEIGHING_CARD)
    assert CARD_FILES[card_index + 1] == WEIGHING_FEEDBACK


def test_weighing_feedback_uses_previous_effective_weight() -> None:
    """Saved feedback compares the entered weight with the selected puppy state."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / WEIGHING_FEEDBACK
    ).read_text(encoding="utf-8")

    assert "const previousWeight = Number(puppy?.weight);" in source
    assert "const gainGrams = savedWeight - previousWeight;" in source
    assert "const growthPercent = (gainGrams / previousWeight) * 100;" in source
    assert 'this._localMessageType = "success";' in source
