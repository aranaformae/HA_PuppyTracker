from pathlib import Path

from custom_components.puppy_tracker.frontend import CARD_FILES


FRONTEND_DIR = (
    Path(__file__).parents[1]
    / "custom_components"
    / "puppy_tracker"
    / "frontend"
)
OVERVIEW_CARD = "puppy-tracker-overview-card.js"
COLLAR_COLORS = "puppy-tracker-collar-chart-colors.js"


def test_collar_chart_color_layer_loads_after_overview_card() -> None:
    """Collar colors are imported by their owners, not loaded as a patch."""
    assert COLLAR_COLORS not in CARD_FILES
    overview = (FRONTEND_DIR / OVERVIEW_CARD).read_text(encoding="utf-8")
    assert 'import { collarColor } from "./puppy-tracker-collar-chart-colors.js";' in overview


def test_common_dutch_collar_colors_have_stable_chart_colors() -> None:
    """Common physical collar labels should not depend on puppy ordering."""
    source = (FRONTEND_DIR / COLLAR_COLORS).read_text(encoding="utf-8")

    for color_name in (
        "blauw",
        "roze",
        "groen",
        "rood",
        "geel",
        "paars",
        "oranje",
        "turquoise",
        "bruin",
        "grijs",
        "zwart",
        "wit",
    ):
        assert f'"{color_name}"' in source
