from pathlib import Path

from custom_components.puppy_tracker.const import DOMAIN, VERSION
from custom_components.puppy_tracker.frontend import CARD_FILES, FRONTEND_URL, _frontend_url


OVERVIEW_LOCALIZATION = "puppy-tracker-overview-localization.js"
WORKSPACE_CARD = "puppy-tracker-workspace-card.js"
OVERVIEW_CARD = "puppy-tracker-overview-card.js"
OVERVIEW_REGISTRY_REFRESH = "puppy-tracker-overview-registry-refresh.js"
DOSSIER_CARD = "puppy-tracker-dossier-card.js"
TIMELINE_CARD = "puppy-tracker-timeline-card.js"
ATTENTION_CARD = "puppy-tracker-attention-card.js"
LITTER_CARD = "puppy-tracker-litter-card.js"
PUBLIC_CARD_FILES = {
    "puppy-tracker-workspace-card.js",
    "puppy-tracker-owner-card.js",
    "puppy-tracker-report-card.js",
}


def test_frontend_route_is_versioned() -> None:
    """Frontend modules must live below a versioned path for cache safety."""
    assert FRONTEND_URL == f"/{DOMAIN}/frontend/{VERSION}"


def test_frontend_module_url_inherits_versioned_path() -> None:
    """Relative ES-module imports inherit the same release-specific base path."""
    filename = "puppy-tracker-attention-card.js"
    assert _frontend_url(filename) == f"/{DOMAIN}/frontend/{VERSION}/{filename}"


def test_overview_registry_refresh_loads_after_overview_card() -> None:
    """Registry refresh belongs to the overview card, not a prototype patch."""
    assert OVERVIEW_REGISTRY_REFRESH not in CARD_FILES


def test_overview_registry_refresh_reloads_device_and_entity_registries() -> None:
    """Structural data updates must refresh discovery before reloading history."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / OVERVIEW_CARD
    ).read_text(encoding="utf-8")
    assert 'type: "config/entity_registry/list"' in source
    assert 'type: "config/device_registry/list"' in source
    assert "await this._refreshRegistryAfterDataUpdate();" in source
    subscription = source[source.index("async _subscribeToData()") :]
    assert subscription.index(
        "await this._refreshRegistryAfterDataUpdate();"
    ) < subscription.index("this._scheduleHistoryReload();")


def test_overview_localization_is_an_imported_utility() -> None:
    """Overview localization must not be a separately registered patch module."""
    assert OVERVIEW_LOCALIZATION not in CARD_FILES
    assert CARD_FILES[-1] == WORKSPACE_CARD


def test_workspace_card_is_registered_after_its_composed_cards() -> None:
    """The public workspace must load after all internal card surfaces."""
    workspace = CARD_FILES.index(WORKSPACE_CARD)
    assert workspace > CARD_FILES.index("puppy-tracker-quick-log-card.js")
    assert workspace > CARD_FILES.index("puppy-tracker-today-card.js")
    assert workspace > CARD_FILES.index("puppy-tracker-care-program-card.js")
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / WORKSPACE_CARD
    ).read_text(encoding="utf-8")
    assert 'role="tab"' in source
    assert 'aria-selected' in source
    assert "static getConfigElement()" in source
    assert "class PuppyTrackerWorkspaceCardEditor" in source
    assert "EDITOR_FIELDS" in source
    assert "window.customCards = window.customCards || [];" in source
    assert "window.customCards = (window.customCards || []).filter" not in source
    assert 'import "./puppy-tracker-care-surfaces.js";' not in source
    attention = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / ATTENTION_CARD
    ).read_text(encoding="utf-8")
    assert 'from "./puppy-tracker-care-surfaces.js";' in attention
    assert 'from "./puppy-tracker-attention-qol.js";' in attention
    assert 'from "./puppy-tracker-mother-surfaces.js";' in attention


def test_only_supported_cards_register_with_lovelace() -> None:
    """Internal composition surfaces must not reappear in the card picker."""
    frontend = Path(__file__).parents[1] / "custom_components" / "puppy_tracker" / "frontend"

    registered_files = {
        path.name
        for path in frontend.glob("puppy-tracker-*.js")
        if "window.customCards" in path.read_text(encoding="utf-8")
    }

    assert registered_files == PUBLIC_CARD_FILES


def test_workspace_preserves_scroll_and_programmatic_focus_does_not_scroll() -> None:
    """Interactive rerenders must not move a mobile dashboard unexpectedly."""
    frontend = Path(__file__).parents[1] / "custom_components" / "puppy_tracker" / "frontend"
    common = (frontend / "puppy-tracker-card-common.js").read_text(encoding="utf-8")
    workspace = (frontend / WORKSPACE_CARD).read_text(encoding="utf-8")
    dossier = (frontend / "puppy-tracker-dossier-card.js").read_text(encoding="utf-8")
    quick_log = (frontend / "puppy-tracker-quick-log-card.js").read_text(encoding="utf-8")

    assert "export function preserveScrollPosition" in common
    assert "preserveScrollPosition(this" in workspace
    assert 'mobile: { tabs: ["weighing", "quickLog", "today", "care"]' in workspace
    assert 'show_day_selector: this._preset !== "mobile"' in workspace
    assert "focus({ preventScroll: true })" in dossier
    assert "focus({ preventScroll: true })" in quick_log


def test_workspace_litter_selector_setting_reaches_every_surface() -> None:
    """The shared selector switch must not be ignored by composed cards."""
    frontend = Path(__file__).parents[1] / "custom_components" / "puppy_tracker" / "frontend"
    workspace = (frontend / WORKSPACE_CARD).read_text(encoding="utf-8")

    for surface in ("puppies", "weighing", "analysis", "temperature"):
        assert f'{surface}: {{ show_litter_selector: showLitter' in workspace

    for filename in (
        "puppy-tracker-card.js",
        "puppy-tracker-overview-card.js",
        "puppy-tracker-litter-card.js",
        "puppy-tracker-temperature-card.js",
    ):
        source = (frontend / filename).read_text(encoding="utf-8")
        assert "show_litter_selector: true" in source
        assert "show_litter_selector !== false" in source


def test_workspace_owns_shared_litter_context_and_pauses_hidden_surfaces() -> None:
    """Composed surfaces share one litter and only the visible tab stays active."""
    frontend = Path(__file__).parents[1] / "custom_components" / "puppy_tracker" / "frontend"
    common = (frontend / "puppy-tracker-card-common.js").read_text(encoding="utf-8")
    workspace = (frontend / WORKSPACE_CARD).read_text(encoding="utf-8")
    weighing = (frontend / "puppy-tracker-card.js").read_text(encoding="utf-8")

    assert 'export const LITTER_CHANGE_EVENT = "puppy-tracker-litter-change"' in common
    assert "export function requestLitterChange" in common
    assert "this.addEventListener(LITTER_CHANGE_EVENT" in workspace
    assert "this._litterId = litterId" in workspace
    assert "child.remove()" in workspace
    assert "surface.appendChild(child)" in workspace
    assert "previousLanguage !== this._language" in workspace
    assert "surfaceTitle" not in workspace
    assert 'common.state_key = `${this._storageIdentity}.${key}`' in workspace
    assert "announceLitterChange" in weighing
    assert "_announceSelectedLitter(station)" in weighing
    assert 'identifier?.slice("litter_".length)' in weighing
    for filename in (
        "puppy-tracker-summary-card.js",
        "puppy-tracker-today-card.js",
        "puppy-tracker-attention-card.js",
        "puppy-tracker-litter-card.js",
        "puppy-tracker-quick-log-card.js",
        "puppy-tracker-dossier-card.js",
        "puppy-tracker-timeline-card.js",
        "puppy-tracker-temperature-card.js",
        "puppy-tracker-care-execution-card.js",
        "puppy-tracker-care-program-card.js",
        "puppy-tracker-recurring-reminder-card.js",
        "puppy-tracker-bulk-dossier-card.js",
    ):
        source = (frontend / filename).read_text(encoding="utf-8")
        assert "requestLitterChange" in source


def test_owner_card_is_declarative_localized_and_keeps_long_notes_visible() -> None:
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-owner-card.js"
    ).read_text(encoding="utf-8")

    assert 'placementDate: "Plaatsingsdatum"' in source
    assert 'paymentDate: "Betaaldatum"' in source
    assert 'placementDate: "Placement date"' in source
    assert 'paymentDate: "Payment date"' in source
    assert 'owners: "Baasjes"' in source
    assert 'owners: "Owners"' in source
    assert source.count('textarea name="notes"') == 1
    assert '"wide notes preformatted"' in source
    assert ".owner-detail .notes>div{max-height:none;overflow:visible}" in source
    assert "form.insertBefore" not in source
    assert "style.order" not in source
    assert "document.createElement(\"style\")" not in source


def test_cards_own_their_localization() -> None:
    """Cards localize in their own render lifecycles without a global bridge."""
    overview_localization = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / OVERVIEW_LOCALIZATION
    ).read_text(encoding="utf-8")
    overview = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / OVERVIEW_CARD
    ).read_text(encoding="utf-8")
    assert 'from "./puppy-tracker-overview-localization.js"' in overview
    assert "localizeOverviewRoot(this.shadowRoot, this._hass);" in overview
    assert "MutationObserver" not in overview_localization

    summary = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-summary-card.js"
    ).read_text(encoding="utf-8")
    assert 'languageForHass' in summary
    assert 'noLitter: "No litter"' in summary
    assert 'noLitter: "Geen nest"' in summary

    litter = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / LITTER_CARD
    ).read_text(encoding="utf-8")
    assert 'languageForHass' in litter
    assert 'noPuppies: "No puppies to show."' in litter
    assert 'noPuppies: "Geen pups om te tonen."' in litter

    report = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-report-card.js"
    ).read_text(encoding="utf-8")
    assert 'title: "Report & export"' in report
    assert 'title: "Rapport & export"' in report
    assert 'preparingExport: "Preparing {format}…"' in report
    assert 'reportText(configHass(), "hours24")' in report

    weighing = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-card.js"
    ).read_text(encoding="utf-8")
    assert 'title: "Puppy weighing station"' in weighing
    assert 'title: "Puppy weegstation"' in weighing
    assert 'statusOk: "Good"' in weighing
    assert 'this._sessionPresentation(sessionState?.state)' in weighing


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
    assert '{ name: "max_items"' in source
    assert '{ name: "compact"' in source


def test_dossier_and_timeline_expose_configurable_default_scopes() -> None:
    """Dossier and timeline cards support the same persisted scope choices."""
    frontend = Path(__file__).parents[1] / "custom_components" / "puppy_tracker" / "frontend"
    dossier = (frontend / DOSSIER_CARD).read_text(encoding="utf-8")
    timeline = (frontend / TIMELINE_CARD).read_text(encoding="utf-8")

    for source in (dossier, timeline):
        assert 'name: "default_selected"' in source
        assert 'config.default_selected' in source
        assert 'config.default_scope' not in source
    assert '{ value: "all", label: "Alles" }' in dossier
    assert '{ value: "mother", label: "Moederhond" }' in dossier
    assert '{ value: "all", label: "Alles" }' in timeline
    assert '{ value: "mother", label: "Moederhond" }' in timeline


def test_dossier_and_quick_log_expose_feeding_record_type() -> None:
    """Feeding is a first-class dossier type on both logging surfaces."""
    frontend = Path(__file__).parents[1] / "custom_components" / "puppy_tracker" / "frontend"
    schema = (frontend / "puppy-tracker-dossier-schema.js").read_text(encoding="utf-8")
    quick_log = (frontend / "puppy-tracker-quick-log-card.js").read_text(encoding="utf-8")

    assert '["feeding", "feeding", "mdi:baby-bottle-outline"]' in schema
    assert "feeding: [" in schema
    assert '{ id: "feeding", recordType: "feeding"' in quick_log


def test_dossier_owner_change_supports_litter_mother_and_puppy_scopes() -> None:
    """Owner changes expose all valid scopes and pass them to the API."""
    root = Path(__file__).parents[1]
    card = (root / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-dossier-card.js").read_text(encoding="utf-8")
    common = (root / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-card-common.js").read_text(encoding="utf-8")
    api = (root / "custom_components" / "puppy_tracker" / "api.py").read_text(encoding="utf-8")

    assert 'scope: "mother"' in card
    assert 'scope: "litter"' in card
    assert 'scope: "puppy"' in card
    assert "options.sourceScope" in common
    assert 'vol.Optional("source_scope")' in api
    assert 'vol.Optional("target_scope")' in api


def test_overview_renders_litter_weight_comparison() -> None:
    """The overview card exposes the relative weight context from the backend."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-overview-card.js"
    ).read_text(encoding="utf-8")
    chart = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-chart-time-navigation.js"
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
    assert "visibleMilestones" in chart
    assert "projectedMilestone" in chart
    assert "milestone-projection" in chart
    assert "milestone-progress" in source
    assert "estimated_range_start" in chart
    assert "milestone_projection" in source
    assert "Onregelmatig meetinterval" in source
    assert "milestone-projection-band" in chart


def test_overview_exposes_basic_and_advanced_visibility_options() -> None:
    """Overview visibility can be tailored per Lovelace card instance."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / "puppy-tracker-overview-card.js"
    ).read_text(encoding="utf-8")

    for option in (
        "show_advanced_analysis",
        "show_growth_milestones",
        "show_milestone_chart_annotations",
    ):
        assert f'name: "{option}"' in source

    assert "show_advanced_analysis: false" in source
    assert "show_growth_milestones: true" in source
    assert "show_milestone_chart_annotations: true" in source


def test_litter_card_exposes_basic_and_advanced_detail_option() -> None:
    """The litter overview can hide secondary columns and expanded details."""
    source = (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / LITTER_CARD
    ).read_text(encoding="utf-8")

    assert "show_details: true" in source
    assert '{ name: "show_details", selector: { boolean: {} } }' in source
    assert "detailsEnabled" in source
