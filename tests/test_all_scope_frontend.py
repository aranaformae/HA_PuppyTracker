from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_all_scope_module_is_registered_after_mother_support() -> None:
    frontend = _read("custom_components/puppy_tracker/frontend.py")

    mother_index = frontend.index('"puppy-tracker-mother-surfaces.js"')
    all_index = frontend.index('"puppy-tracker-all-scope.js"')
    compact_index = frontend.index('"puppy-tracker-ui-compact.js"')

    assert mother_index < all_index < compact_index


def test_timeline_all_scope_combines_mother_with_litter_and_puppies() -> None:
    source = _read("custom_components/puppy_tracker/frontend/puppy-tracker-all-scope.js")

    assert 'const ALL_VALUE = "__all__"' in source
    assert 'this._scope = "all"' in source
    assert 'this._scope = "litter"' in source
    assert 'type: "puppy_tracker/mother/records"' in source
    assert 'history_scope: "current"' in source
    assert "motherTimelineEvent" in source
    assert 'return sortNewestFirst([...(events || []), ...motherEvents]);' in source
    assert '"Alles (incl. moeder)"' in source


def test_dossier_all_scope_is_read_only_aggregate() -> None:
    source = _read("custom_components/puppy_tracker/frontend/puppy-tracker-all-scope.js")

    assert "fetchLitterData" in source
    assert "fetchRecords" in source
    assert "puppies.map((puppy) => fetchRecords" in source
    assert 'decorateRecord(record, "litter"' in source
    assert 'decorateRecord(record, "mother"' in source
    assert 'decorateRecord(record, "puppy"' in source
    assert 'can_manage_records: false' in source
    assert 'if (this.__allSelected) return "";' in source
    assert '"Alles (nest + moeder + pups)"' in source


def test_all_scope_does_not_relabel_authoritative_owner_scopes() -> None:
    source = _read("custom_components/puppy_tracker/frontend/puppy-tracker-all-scope.js")

    assert "__aggregate_owner_scope" in source
    assert re.search(r"(?<![A-Za-z0-9_])owner_scope\s*[:=]", source) is None
    assert "async_match_record" not in source
    assert "last_completed_at" not in source
    assert "recurring_reminders" not in source
