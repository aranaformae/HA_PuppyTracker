from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend"
FRONTEND_PY = ROOT / "custom_components" / "puppy_tracker" / "frontend.py"
TEMPERATURE_UI = FRONTEND / "puppy-tracker-temperature-ui.js"
SCHEMA = FRONTEND / "puppy-tracker-dossier-schema.js"


def test_temperature_ui_module_loads_after_logging_cards() -> None:
    source = FRONTEND_PY.read_text(encoding="utf-8")
    assert '"puppy-tracker-quick-log-card.js"' in source
    assert '"puppy-tracker-bulk-dossier-card.js"' in source
    assert '"puppy-tracker-timeline-card.js"' in source
    assert '"puppy-tracker-temperature-ui.js"' in source
    assert source.index('"puppy-tracker-timeline-card.js"') < source.index('"puppy-tracker-temperature-ui.js"')


def test_temperature_is_structured_dossier_type() -> None:
    source = SCHEMA.read_text(encoding="utf-8")
    assert '["temperature", "temperature", "mdi:thermometer"]' in source
    assert 'key: "temperature_c"' in source
    assert 'required: true' in source


def test_quick_log_supports_temperature_value() -> None:
    source = TEMPERATURE_UI.read_text(encoding="utf-8")
    assert 'data-preset = "temperature"' in source or 'dataset.preset = "temperature"' in source
    assert 'record_type: "temperature"' in source
    assert 'data: { temperature_c: temperature }' in source
    assert 'id="quick-temperature"' in source


def test_bulk_log_adds_temperature_type() -> None:
    source = TEMPERATURE_UI.read_text(encoding="utf-8")
    assert 'BULK_RECORD_TYPES.unshift(["temperature", "temperature"])' in source


def test_timeline_promotes_temperature_and_displays_value() -> None:
    source = TEMPERATURE_UI.read_text(encoding="utf-8")
    assert 'event?.raw_type !== "temperature"' in source
    assert 'type: "temperature"' in source
    assert '`${formatted} °C`' in source
    assert 'mdi:thermometer' in source


def test_temperature_labels_are_localized() -> None:
    source = TEMPERATURE_UI.read_text(encoding="utf-8")
    assert 'return isEnglish(card) ? "Temperature" : "Temperatuur"' in source
    assert 'option[value="temperature"]' in source
