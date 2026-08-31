from pathlib import Path

from custom_components.puppy_tracker.frontend import CARD_FILES


PROFILE_NOTE_MODULE = "puppy-tracker-litter-profile-note.js"
LITTER_CARD_MODULE = "puppy-tracker-litter-card.js"


def test_profile_note_module_loads_after_litter_card() -> None:
    """The enhancement must patch the litter card only after it is registered."""
    assert PROFILE_NOTE_MODULE in CARD_FILES
    assert CARD_FILES.index(PROFILE_NOTE_MODULE) == CARD_FILES.index(LITTER_CARD_MODULE) + 1


def test_profile_note_module_uses_existing_payload_and_safe_text() -> None:
    """Profile notes are rendered from litter data without injecting HTML."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / PROFILE_NOTE_MODULE
    ).read_text(encoding="utf-8")

    assert "card._data.puppies" in source
    assert "puppy?.profile_note" in source
    assert 'text.textContent = note' in source
    assert 'block.className = "profile-note"' in source
