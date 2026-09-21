from pathlib import Path

from custom_components.puppy_tracker.frontend import CARD_FILES

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend"


def test_care_surfaces_are_imported_by_their_base_cards() -> None:
    assert "puppy-tracker-care-surfaces.js" not in CARD_FILES
    for filename in (
        "puppy-tracker-today-card.js",
        "puppy-tracker-attention-card.js",
        "puppy-tracker-care-execution-card.js",
    ):
        source = (FRONTEND / filename).read_text()
        assert 'from "./puppy-tracker-care-surfaces.js";' in source


def test_care_surfaces_use_backend_occurrence_status() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert 'type: "puppy_tracker/care_occurrences"' in source
    assert '"completed", "missed"' in source
    assert 'item?.status === "overdue"' in source
    assert 'item?.status === "due_today"' in source
    assert 'item.status === "upcoming"' in source
    assert "care_occurrence_id" not in source


def test_same_day_upcoming_care_uses_clock_label_not_zero_days() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert "if (days === 0)" in source
    assert "item?.time_of_day" in source
    assert "Vandaag om ${clock}" in source
    assert "Today at ${clock}" in source


def test_attention_today_and_execution_export_explicit_surface_functions() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert "export async function loadCareOccurrences(card)" in source
    assert "export function renderTodayCare(card)" in source
    assert "export function renderAttentionCare(card)" in source
    assert "export function renderCareExecutionRows(card)" in source
    assert ".prototype" not in source
    assert "registerCardHooks" not in source


def test_base_cards_compose_care_surfaces_explicitly() -> None:
    common = (FRONTEND / "puppy-tracker-card-common.js").read_text()
    assert "registerCardHooks" not in common
    assert "runCardLoadHooks" not in common
    assert "runCardRenderHooks" not in common
    today = (FRONTEND / "puppy-tracker-today-card.js").read_text()
    attention = (FRONTEND / "puppy-tracker-attention-card.js").read_text()
    execution = (FRONTEND / "puppy-tracker-care-execution-card.js").read_text()
    assert "await loadCareOccurrences(this);" in today
    assert "renderTodayCare(this);" in today
    assert "loadCareOccurrences(this)," in attention
    assert "renderAttentionCare(this);" in attention
    assert "renderCareExecutionRows(this);" in execution


def test_care_extensions_do_not_patch_card_prototypes() -> None:
    for filename in (
        "puppy-tracker-care-surfaces.js",
        "puppy-tracker-today-qol.js",
        "puppy-tracker-attention-qol.js",
    ):
        source = (FRONTEND / filename).read_text()
        assert ".prototype" not in source
        assert "registerCardHooks" not in source


def test_attention_can_limit_care_items_to_today() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert "function isTodayItem(item)" in source
    assert 'item?.scheduled_date' in source
    assert 'item?.status === "due_today"' in source
    assert 'Number(item?.days_until_due) === 0' in source
    assert "card._config?.show_today_only !== true || isTodayItem(item)" in source


def test_attention_setting_only_filters_care_occurrences() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert "function attentionItems(card)" in source
    assert 'item?.counts_for_attention !== false' in source
    assert 'data-care-occurrence' in source


def test_care_summary_has_a_scroll_fallback_outside_today_qol() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert ".care-summary{" in source
    assert "max-height:520px" in source
    assert "overflow-y:auto" in source


def test_open_care_rows_launch_structured_result_entry() -> None:
    editor = (FRONTEND / "puppy-tracker-care-result-editor.js").read_text()
    surfaces = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    execution = (FRONTEND / "puppy-tracker-care-execution-card.js").read_text()
    assert "export function openCareResultEditor(card, item" in editor
    assert 'type: "puppy_tracker/care_occurrence/record"' in editor
    assert "program_id: item.program_id" in editor
    assert "puppy_id: item.puppy_id" in editor
    assert "occurrence_id: item.id" in editor
    assert 'value="completed"' in editor
    assert 'value="missed"' in editor
    assert 'fields.has("result")' in editor
    assert 'fields.has("score")' in editor
    assert 'fields.has("note")' in editor
    assert 'role="dialog"' in editor
    assert 'aria-modal="true"' in editor
    assert "openCareResultEditor(card, item)" in surfaces
    assert "openCareResultEditor(this, item" in execution
    assert "addCareDirectActionButtons" in surfaces
    assert "row.click()" not in surfaces


def test_care_result_save_refreshes_backend_derived_status() -> None:
    editor = (FRONTEND / "puppy-tracker-care-result-editor.js").read_text()
    surfaces = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    execution = (FRONTEND / "puppy-tracker-care-execution-card.js").read_text()
    record_call = editor.index('type: "puppy_tracker/care_occurrence/record"')
    refresh = editor.index("await refreshCard(card);", record_call)
    assert record_call < refresh
    assert "await card._loadData();" in editor
    assert "await card._loadOccurrences();" in editor
    assert "data-care-occurrence" in surfaces
    assert "wireCareRows(card);" in surfaces
    assert "findCareOccurrence" in surfaces
    assert "subscribeUpdates" in execution
    assert "this._refreshAgain = true" in execution
    assert "this._config.show_day_selector === false" in execution


def test_skipped_puppies_are_not_silently_hidden() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert "export function renderCareSkippedWarning(card)" in source
    assert "card.__careSkipped" in source
    assert 'item?.reason_code === "missing_birth_time"' in source
    assert "geboortetijd ontbreekt" in source
    assert "birth time is missing" in source
    assert 'root.querySelector(".all-ok")?.remove()' in source
