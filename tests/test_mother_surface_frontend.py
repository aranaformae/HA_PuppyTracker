from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend"


def test_mother_profiles_are_created_as_home_assistant_devices() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "devices.py").read_text(encoding="utf-8")

    assert 'f"mother_{mother_id}"' in source
    assert 'for mother_id, mother in data.get(' in source
    assert '"mothers"' in source
    assert 'model="Mother dog"' in source


def test_mother_attention_extension_is_imported_by_attention() -> None:
    frontend = (ROOT / "custom_components" / "puppy_tracker" / "frontend.py").read_text(encoding="utf-8")
    attention = (FRONTEND / "puppy-tracker-attention-card.js").read_text(encoding="utf-8")

    assert '"puppy-tracker-mother-surfaces.js"' not in frontend
    assert 'import "./puppy-tracker-mother-surfaces.js";' in attention
    assert '"puppy-tracker-temperature-ui.js"' not in frontend


def test_mother_attention_rows_join_shared_filters_and_acknowledgements() -> None:
    mother = (FRONTEND / "puppy-tracker-mother-surfaces.js").read_text(encoding="utf-8")
    qol = (FRONTEND / "puppy-tracker-attention-qol.js").read_text(encoding="utf-8")

    assert "priority: 350" in mother
    assert "row.dataset.attentionId" in mother
    assert "row.dataset.attentionType" in mother
    assert "if (row.dataset.attentionId && row.dataset.attentionType) continue;" in qol
    assert qol.index("priority: 400") > 0


def test_quick_log_supports_mother_records_including_temperature() -> None:
    source = (FRONTEND / "puppy-tracker-quick-log-card.js").read_text(encoding="utf-8")
    extension = (FRONTEND / "puppy-tracker-mother-surfaces.js").read_text(encoding="utf-8")

    assert 'const MOTHER_OWNER = "__mother__"' in source
    assert 'type: "puppy_tracker/mother/record/add"' in source
    assert 'id: "temperature", recordType: "temperature"' in source
    assert '{ temperature_c: temperature }' in source
    assert '${escapeHtml(text(this._hass, "mother"))} · ${escapeHtml(litter.mother)}' in source
    assert "this.__motherSelected = value === MOTHER_OWNER" in source
    assert ".prototype" not in extension


def test_timeline_supports_mother_scope_and_current_litter_records() -> None:
    source = (FRONTEND / "puppy-tracker-timeline-card.js").read_text(encoding="utf-8")
    extension = (FRONTEND / "puppy-tracker-mother-surfaces.js").read_text(encoding="utf-8")

    assert 'const MOTHER_VALUE = "__mother__"' in source
    assert 'value === MOTHER_VALUE' in source
    assert 'this._scope = "mother"' in source
    assert 'type: `${DOMAIN}/mother/records`' in source
    assert 'history_scope: "current"' in source
    assert 'include_deleted: Boolean(this._showHistory && this._canManageHistory)' in source
    assert 'scope: "mother"' in source
    assert "__puppyTrackerMotherTimelinePatched" not in extension
