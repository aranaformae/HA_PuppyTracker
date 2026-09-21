from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_dossier_and_timeline_do_not_require_an_all_scope_patch_module() -> None:
    frontend = _read("custom_components/puppy_tracker/frontend.py")

    assert '"puppy-tracker-dossier-card.js"' in frontend
    assert '"puppy-tracker-timeline-card.js"' in frontend
    assert '"puppy-tracker-all-scope.js"' not in frontend


def test_timeline_all_scope_combines_mother_with_litter_and_puppies() -> None:
    source = _read("custom_components/puppy_tracker/frontend/puppy-tracker-timeline-card.js")

    assert 'const ALL_VALUE = "__all__"' in source
    assert 'this._scope = "all"' in source
    assert 'scope: this._scope === "all" ? "litter" : this._scope' in source
    assert 'type: `${DOMAIN}/mother/records`' in source
    assert 'history_scope: "current"' in source
    assert "motherRecordEvent" in source
    assert 'sortTimelineEvents([...events, ...motherEvents])' in source
    assert '"Alles (incl. moeder)"' in source


def test_dossier_all_scope_keeps_owner_context_for_crud() -> None:
    dossier = _read("custom_components/puppy_tracker/frontend/puppy-tracker-dossier-card.js")

    assert "fetchLitterData" in dossier
    assert "fetchRecords" in dossier
    assert "puppies.map((puppy) => fetchRecords" in dossier
    assert 'decorateRecord(record, "litter"' in dossier
    assert 'decorateRecord(record, "mother"' in dossier
    assert 'decorateRecord(record, "puppy"' in dossier
    assert "__aggregate_owner_puppy_id" in dossier
    assert "__aggregate_record_key" in dossier
    assert "canManageRecords" in dossier
    assert "updateMotherDossierRecord" in dossier
    assert "deleteMotherDossierRecord" in dossier
    assert "restoreMotherDossierRecord" in dossier
    assert "_recordOwnerContext" in dossier
    assert "this._canManage && !this.__allSelected" in dossier
    assert "this.__allSelected" in dossier
    assert '"Alles (nest + moeder + pups)"' in dossier


def test_all_scope_does_not_relabel_authoritative_owner_scopes() -> None:
    source = _read("custom_components/puppy_tracker/frontend/puppy-tracker-dossier-card.js")

    assert "__aggregate_owner_scope" in source
    assert "\n    owner_scope: scope," not in source
    assert "async_match_record" not in source
    assert "last_completed_at" not in source
    assert "recurring_reminders" not in source
