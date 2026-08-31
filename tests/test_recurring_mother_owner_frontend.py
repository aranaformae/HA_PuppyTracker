from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_recurring_reminder_resolves_mother_from_mother_scope_api() -> None:
    frontend = (ROOT / "custom_components" / "puppy_tracker" / "frontend.py").read_text(encoding="utf-8")
    source = (
        ROOT
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-recurring-mother-owner.js"
    ).read_text(encoding="utf-8")

    assert '"puppy-tracker-recurring-reminder-card.js"' in frontend
    assert '"puppy-tracker-recurring-mother-owner.js"' in frontend
    assert frontend.index('"puppy-tracker-recurring-reminder-card.js"') < frontend.index(
        '"puppy-tracker-recurring-mother-owner.js"'
    )
    assert 'type: "puppy_tracker/mother/records"' in source
    assert 'payload?.owner?.id' in source
    assert 'value: `mother:${mother.id}`' in source
    assert 'scope: "mother"' in source


def test_recurring_reminder_does_not_require_litter_mother_id() -> None:
    source = (
        ROOT
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-recurring-mother-owner.js"
    ).read_text(encoding="utf-8")

    assert "litter?.mother" in source
    assert "litter?.mother_id" not in source
