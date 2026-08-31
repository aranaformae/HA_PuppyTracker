from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend.py"
MOTHER_UI = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-mother-dossier.js"


def test_mother_dossier_extension_loads_after_base_dossier_card() -> None:
    source = FRONTEND.read_text(encoding="utf-8")
    assert source.index('"puppy-tracker-dossier-card.js"') < source.index(
        '"puppy-tracker-mother-dossier.js"'
    )


def test_mother_owner_and_history_filter_are_available() -> None:
    source = MOTHER_UI.read_text(encoding="utf-8")
    assert 'const MOTHER_OWNER = "__mother__"' in source
    assert '"Huidig nest", "Current litter"' in source
    assert '"Alle nesten", "All litters"' in source
    assert 'type: "puppy_tracker/mother/records"' in source
    assert 'history_scope: historyScope' in source


def test_mother_dossier_crud_uses_dedicated_api() -> None:
    source = MOTHER_UI.read_text(encoding="utf-8")
    assert 'motherCall(this._hass, "record/add"' in source
    assert 'motherCall(this._hass, "record/update"' in source
    assert 'motherCall(this._hass, "record/delete"' in source
    assert 'motherCall(this._hass, "record/restore"' in source
    assert 'motherCall(this._hass, "profile_note/update"' in source


def test_all_litter_history_shows_record_litter_context() -> None:
    source = MOTHER_UI.read_text(encoding="utf-8")
    assert 'records[index]?.litter_name' in source
    assert 'mother-litter-badge' in source
