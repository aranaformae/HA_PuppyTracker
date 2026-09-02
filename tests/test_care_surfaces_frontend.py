from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend"


def test_care_surfaces_are_registered_after_base_cards() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "frontend.py").read_text()
    care = source.index('"puppy-tracker-care-surfaces.js"')
    warning = source.index('"puppy-tracker-care-skipped-warning.js"')
    assert source.index('"puppy-tracker-today-card.js"') < care
    assert source.index('"puppy-tracker-attention-card.js"') < care
    assert care < warning


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


def test_attention_and_today_are_both_patched() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert 'const TODAY_TAG = "puppy-tracker-today-card"' in source
    assert 'const ATTENTION_TAG = "puppy-tracker-attention-card"' in source
    assert "patchToday();" in source
    assert "patchAttention();" in source


def test_attention_can_limit_care_items_to_today() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert "function isTodayItem(item)" in source
    assert 'item?.status === "due_today" || Number(item?.days_until_due) === 0' in source
    assert "this._config?.show_today_only !== true || isTodayItem(item)" in source


def test_open_care_rows_launch_structured_result_entry() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    assert "function openResultEditor(card, item)" in source
    assert 'type: "puppy_tracker/care_occurrence/record"' in source
    assert "program_id: item.program_id" in source
    assert "puppy_id: item.puppy_id" in source
    assert "occurrence_id: item.id" in source
    assert 'value="completed"' in source
    assert 'value="missed"' in source
    assert 'fields.has("result")' in source
    assert 'fields.has("score")' in source
    assert 'fields.has("note")' in source


def test_care_result_save_refreshes_backend_derived_status() -> None:
    source = (FRONTEND / "puppy-tracker-care-surfaces.js").read_text()
    record_call = source.index('type: "puppy_tracker/care_occurrence/record"')
    refresh = source.index("await card._loadData();", record_call)
    assert record_call < refresh
    assert "data-care-occurrence" in source
    assert "wireCareRows(this);" in source


def test_skipped_puppies_are_not_silently_hidden() -> None:
    source = (FRONTEND / "puppy-tracker-care-skipped-warning.js").read_text()
    assert 'const TAGS = ["puppy-tracker-today-card", "puppy-tracker-attention-card"]' in source
    assert "card.__careSkipped" in source
    assert 'item?.reason_code === "missing_birth_time"' in source
    assert "geboortetijd ontbreekt" in source
    assert "birth time is missing" in source
    assert 'root.querySelector(".all-ok")?.remove()' in source
