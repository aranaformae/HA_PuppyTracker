from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOSSIER_UI = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-dossier-card.js"


def test_mother_owner_and_history_filter_are_available() -> None:
    source = DOSSIER_UI.read_text(encoding="utf-8")
    assert 'const MOTHER_OWNER = "__mother__"' in source
    assert '"Huidig nest", "Current litter"' in source
    assert '"Alle nesten", "All litters"' in source
    assert 'type: "puppy_tracker/mother/records"' in source
    assert 'history_scope: historyScope' in source


def test_mother_dossier_crud_uses_dedicated_api() -> None:
    source = DOSSIER_UI.read_text(encoding="utf-8")
    assert 'type: "puppy_tracker/mother/record/add"' in source
    assert "updateMotherDossierRecord" in source
    assert "deleteMotherDossierRecord" in source
    assert "restoreMotherDossierRecord" in source
    assert 'type: "puppy_tracker/mother/profile_note/update"' in source


def test_all_litter_history_shows_record_litter_context() -> None:
    source = DOSSIER_UI.read_text(encoding="utf-8")
    assert "record.litter_name" in source
    assert 'mother-litter-badge' in source
