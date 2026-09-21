from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend"
FRONTEND_PY = ROOT / "custom_components" / "puppy_tracker" / "frontend.py"
SCHEMA = FRONTEND / "puppy-tracker-dossier-schema.js"
QUICK_LOG = FRONTEND / "puppy-tracker-quick-log-card.js"


def test_temperature_support_is_owned_by_the_logging_cards() -> None:
    source = FRONTEND_PY.read_text(encoding="utf-8")
    assert '"puppy-tracker-quick-log-card.js"' in source
    assert '"puppy-tracker-bulk-dossier-card.js"' in source
    assert '"puppy-tracker-timeline-card.js"' in source
    assert '"puppy-tracker-temperature-ui.js"' not in source
    assert not (FRONTEND / "puppy-tracker-temperature-ui.js").exists()


def test_temperature_is_structured_dossier_type() -> None:
    source = SCHEMA.read_text(encoding="utf-8")
    assert '["temperature", "temperature", "mdi:thermometer"]' in source
    assert 'key: "temperature_c"' in source
    assert 'required: true' in source


def test_quick_log_supports_temperature_value() -> None:
    source = QUICK_LOG.read_text(encoding="utf-8")
    assert 'id: "temperature", recordType: "temperature"' in source
    assert 'data: preset.id === "temperature" ? { temperature_c: temperature } : {}' in source
    assert 'id="quick-temperature"' in source
    assert 'type: "puppy_tracker/mother/record/add"' in source


def test_bulk_log_adds_temperature_type() -> None:
    source = SCHEMA.read_text(encoding="utf-8")
    assert 'export const BULK_RECORD_TYPES = [' in source
    assert '["temperature", "temperature"]' in source


def test_timeline_promotes_temperature_and_displays_value() -> None:
    source = (FRONTEND / "puppy-tracker-timeline-card.js").read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert 'event?.raw_type !== "temperature"' in source
    assert 'type: "temperature"' in source
    assert '`${formatted} °C`' in source
    assert "recordTypeIcon(event.type)" in source
    assert '["temperature", "temperature", "mdi:thermometer"]' in schema


def test_temperature_labels_are_localized() -> None:
    source = QUICK_LOG.read_text(encoding="utf-8")
    schema = SCHEMA.read_text(encoding="utf-8")
    assert 'temperature: "Temperature"' in source
    assert 'temperature: "Temperatuur"' in source
    assert '["temperature", "temperature", "mdi:thermometer"]' in schema
