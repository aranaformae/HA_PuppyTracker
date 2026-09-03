from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend"


def test_mother_profiles_are_created_as_home_assistant_devices() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "devices.py").read_text(encoding="utf-8")

    assert 'f"mother_{mother_id}"' in source
    assert 'for mother_id, mother in data.get(' in source
    assert '"mothers"' in source
    assert 'model="Mother dog"' in source


def test_mother_surface_extension_loads_after_temperature_layer() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "frontend.py").read_text(encoding="utf-8")

    temperature = source.index('"puppy-tracker-temperature-ui.js"')
    mother = source.index('"puppy-tracker-mother-surfaces.js"')
    compact = source.index('"puppy-tracker-ui-compact.js"')
    assert temperature < mother < compact


def test_quick_log_supports_mother_records_including_temperature() -> None:
    source = (FRONTEND / "puppy-tracker-mother-surfaces.js").read_text(encoding="utf-8")

    assert 'const MOTHER_VALUE = "__mother__"' in source
    assert 'type: `puppy_tracker/mother/${action}`' in source
    assert 'temperature: "temperature"' in source
    assert 'data.temperature_c = temperature' in source
    assert 'option.textContent = `${copy(this, "Moederhond", "Mother")} · ${name}`' in source
    assert "this.__quickLogOwner = value" in source
    assert "const selectedOwner = this.__quickLogOwner" in source


def test_timeline_supports_mother_scope_and_current_litter_records() -> None:
    source = (FRONTEND / "puppy-tracker-mother-surfaces.js").read_text(encoding="utf-8")

    assert 'if (value !== MOTHER_VALUE) return originalSelectScope.call(this, value);' in source
    assert 'this._scope = "mother"' in source
    assert 'type: "puppy_tracker/mother/records"' in source
    assert 'history_scope: "current"' in source
    assert 'include_deleted: Boolean(this._showHistory && this._canManageHistory)' in source
    assert 'scope: "mother"' in source
