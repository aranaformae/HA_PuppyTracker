"""Static contracts for the behavior Workspace surface."""

import re
from pathlib import Path

from custom_components.puppy_tracker.behavior import BEHAVIOR_CRITERIA
from custom_components.puppy_tracker.frontend import CARD_FILES

ROOT = Path(__file__).parents[1]
CARD = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-behavior-card.js"
WORKSPACE = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-workspace-card.js"


def test_behavior_surface_is_loaded_before_workspace_and_not_public() -> None:
    source = CARD.read_text()
    workspace = WORKSPACE.read_text()

    assert "puppy-tracker-behavior-card.js" in CARD_FILES
    assert CARD_FILES.index("puppy-tracker-behavior-card.js") < CARD_FILES.index(
        "puppy-tracker-workspace-card.js"
    )
    assert 'customElements.define("puppy-tracker-behavior-card"' in source
    assert 'type: "puppy-tracker-behavior-card"' not in source
    assert 'behavior: { tag: "puppy-tracker-behavior-card"' in workspace
    assert 'journal: { tabs: ["quickLog", "dossier", "behavior"' in workspace
    assert 'mobile: { tabs: ["weighing", "quickLog", "today", "care", "behavior"]' in workspace


def test_frontend_criteria_match_the_backend_contract() -> None:
    source = CARD.read_text()
    group_source = source.split("export const BEHAVIOR_GROUPS = [", 1)[1].split("];", 1)[0]
    frontend_criteria = set(re.findall(r'"([a-z_]+)"', group_source)) - {
        "observations",
        "traits",
    }

    assert frontend_criteria == BEHAVIOR_CRITERIA
