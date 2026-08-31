from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INIT = ROOT / "custom_components" / "puppy_tracker" / "__init__.py"
API = ROOT / "custom_components" / "puppy_tracker" / "mother_api.py"
INTEGRITY_STORAGE = (
    ROOT / "custom_components" / "puppy_tracker" / "mother_storage_integrity.py"
)


def test_runtime_uses_mother_scope_integrity_storage() -> None:
    source = INIT.read_text(encoding="utf-8")
    integrity_source = INTEGRITY_STORAGE.read_text(encoding="utf-8")

    assert "from .mother_storage_integrity import MotherScopeIntegrityStorage" in source
    assert "storage = MotherScopeIntegrityStorage(" in source
    assert "async_setup_mother_api(hass)" in source

    # The runtime storage must still extend the actual mother-scope storage;
    # the extra subclass only layers combined base + mother integrity checks.
    assert "from .mother_storage import MotherScopeStorage" in integrity_source
    assert "class MotherScopeIntegrityStorage(MotherScopeStorage):" in integrity_source


def test_mother_api_exposes_read_and_crud_commands() -> None:
    source = API.read_text(encoding="utf-8")
    for command in (
        'f"{DOMAIN}/mother/records"',
        'f"{DOMAIN}/mother/profile_note/update"',
        'f"{DOMAIN}/mother/record/add"',
        'f"{DOMAIN}/mother/record/update"',
        'f"{DOMAIN}/mother/record/delete"',
        'f"{DOMAIN}/mother/record/restore"',
    ):
        assert command in source
    assert 'vol.Optional("history_scope", default="current")' in source
    assert 'vol.In(("current", "all"))' in source


def test_mother_record_mutations_preserve_record_litter_context() -> None:
    source = API.read_text(encoding="utf-8")
    assert "record_litter_id = _record_litter_id" in source
    assert "await storage.async_update_record(\n            record_litter_id" in source
    assert "await storage.async_delete_record(record_litter_id" in source
    assert "await storage.async_restore_record(record_litter_id" in source
