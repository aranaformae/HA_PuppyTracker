from pathlib import Path

from custom_components.puppy_tracker.const import DOMAIN, VERSION
from custom_components.puppy_tracker.frontend import CARD_FILES, FRONTEND_URL, _frontend_url


LOCALIZATION_BRIDGE = "puppy-tracker-localization-bridge.js"
OVERVIEW_CARD = "puppy-tracker-overview-card.js"
OVERVIEW_REGISTRY_REFRESH = "puppy-tracker-overview-registry-refresh.js"
DOSSIER_CARD = "puppy-tracker-dossier-card.js"
TIMELINE_CARD = "puppy-tracker-timeline-card.js"
ATTENTION_CARD = "puppy-tracker-attention-card.js"
LEGACY_LOCALIZED_CARDS = (
    "puppy-tracker-card",
    "puppy-tracker-overview-card",
    "puppy-tracker-summary-card",
    "puppy-tracker-litter-card",
    "puppy-tracker-report-card",
)


def test_frontend_route_is_versioned() -> None:
    """Frontend modules must live below a versioned path for cache safety."""
    assert FRONTEND_URL == f"/{DOMAIN}/frontend/{VERSION}"


def test_frontend_module_url_inherits_versioned_path() -> None:
    """Relative ES-module imports inherit the same release-specific base path."""
    filename = "puppy-tracker-attention-card.js"
    assert _frontend_url(filename) == f"/{DOMAIN}/frontend/{VERSION}/{filename}"


def test_overview_registry_refresh_loads_after_overview_card() -> None:
    """Registry refresh must patch the overview card after it is registered."""
    overview_index = CARD_FILES.index(OVERVIEW_CARD)
    assert CARD_FILES[overview_index + 1] == OVERVIEW_REGISTRY_REFRESH


def test_overview_registry_refresh_reloads_device_and_entity_registries() -> None:
    """Structural data updates must refresh discovery before reloading history."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / OVERVIEW_REGISTRY_REFRESH
    ).read_text(encoding="utf-8")

    assert 'type: "config/entity_registry/list"' in source
    assert 'type: "config/device_registry/list"' in source
    assert "await this._refreshRegistryAfterDataUpdate();" in source
    assert source.index("await this._refreshRegistryAfterDataUpdate();") < source.index(
        "this._scheduleHistoryReload();"
    )


def test_localization_bridge_loads_after_dashboard_cards() -> None:
    """Legacy-card localization must run after the card modules are registered."""
    assert CARD_FILES[-1] == LOCALIZATION_BRIDGE


def test_localization_bridge_covers_all_legacy_cards() -> None:
    """Every card that still contains Dutch UI literals is handled by the bridge."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / LOCALIZATION_BRIDGE
    ).read_text(encoding="utf-8")

    for card_type in LEGACY_LOCALIZED_CARDS:
        assert f'"{card_type}"' in source


def test_timeline_visibility_is_configurable_per_card() -> None:
    """Both dossier and timeline cards expose the timeline item default as config."""
    frontend = Path(__file__).parents[1] / "custom_components" / "puppy_tracker" / "frontend"

    for filename in (DOSSIER_CARD, TIMELINE_CARD):
        source = (frontend / filename).read_text(encoding="utf-8")
        assert "show_timeline_items: false" in source
        assert '{ name: "show_timeline_items", selector: { boolean: {} } }' in source


def test_attention_today_filter_is_configurable() -> None:
    """The attention card can limit care-program rows to today's items."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / ATTENTION_CARD
    ).read_text(encoding="utf-8")

    assert "show_today_only: false" in source
    assert '{ name: "show_today_only", selector: { boolean: {} } }' in source


def test_dossier_and_timeline_expose_configurable_default_scopes() -> None:
    """Dossier and timeline cards support the same persisted scope choices."""
    frontend = Path(__file__).parents[1] / "custom_components" / "puppy_tracker" / "frontend"
    dossier = (frontend / DOSSIER_CARD).read_text(encoding="utf-8")
    timeline = (frontend / TIMELINE_CARD).read_text(encoding="utf-8")

    for source in (dossier, timeline):
        assert 'name: "default_scope"' in source
        assert 'config.default_scope' in source
    assert '{ value: "all", label: "Alles" }' in dossier
    assert '{ value: "mother", label: "Moederhond" }' in dossier
    assert '{ value: "all", label: "Alles" }' in timeline
    assert '{ value: "mother", label: "Mother" }' in timeline


def test_overview_renders_litter_weight_comparison() -> None:
    """The overview card exposes the relative weight context from the backend."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-overview-card.js"
    ).read_text(encoding="utf-8")

    assert "litter_comparison" in source
    assert "Nestpositie" in source
    assert "Afwijking mediaan" in source
    assert "litter_growth_comparison" in source
    assert "Nesttempo" in source
    assert "growth_variability" in source
    assert "Spreiding groeitempo" in source
    assert "birth_weight_recovery" in source
    assert "Geboortegewicht hersteld" in source
    assert "Groeimijlpalen" in source
    assert "Geschat" in source
    assert "milestone-line" in source
    assert "visibleMilestones" in source
    assert "projectedMilestone" in source
    assert "milestone-projection" in source
    assert "milestone-progress" in source
