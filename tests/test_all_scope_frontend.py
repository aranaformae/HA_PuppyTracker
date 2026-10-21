from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")



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
    assert "measurementId: record.measurement_id" in dossier
    editor = _read("custom_components/puppy_tracker/frontend/puppy-tracker-record-editor.js")
    assert "updateMotherDossierRecord" in editor
    assert "deleteMotherDossierRecord" in editor
    assert "restoreMotherDossierRecord" in editor
    assert "__aggregate_owner_puppy_id" in editor
    assert "chooseOwner: this.__allSelected" in dossier
    assert "this.__allSelected" in dossier
    assert '"Alles (nest + moeder + pups)"' in dossier


def test_all_scope_does_not_relabel_authoritative_owner_scopes() -> None:
    source = _read("custom_components/puppy_tracker/frontend/puppy-tracker-dossier-card.js")

    assert "__aggregate_owner_scope" in source
    assert "\n    owner_scope: scope," not in source
    assert "async_match_record" not in source
    assert "last_completed_at" not in source
    assert "recurring_reminders" not in source
