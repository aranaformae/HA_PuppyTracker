from custom_components.puppy_tracker.const import DOMAIN, VERSION
from custom_components.puppy_tracker.frontend import FRONTEND_URL, _frontend_url


def test_frontend_route_is_versioned() -> None:
    """Frontend modules must live below a versioned path for cache safety."""
    assert FRONTEND_URL == f"/{DOMAIN}/frontend/{VERSION}"


def test_frontend_module_url_inherits_versioned_path() -> None:
    """Relative ES-module imports inherit the same release-specific base path."""
    filename = "puppy-tracker-attention-card.js"
    assert _frontend_url(filename) == f"/{DOMAIN}/frontend/{VERSION}/{filename}"
