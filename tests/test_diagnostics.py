from custom_components.puppy_tracker.const import VERSION
from custom_components.puppy_tracker.diagnostics import FRONTEND_VERSION


def test_diagnostics_frontend_version_matches_release() -> None:
    """Diagnostics import must remain valid and report the active frontend release."""
    assert FRONTEND_VERSION == VERSION
