from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend"
SCHEMA = FRONTEND / "puppy-tracker-dossier-schema.js"
QUICK_LOG = FRONTEND / "puppy-tracker-quick-log-card.js"


def test_temperature_is_structured_dossier_type() -> None:
    source = SCHEMA.read_text(encoding="utf-8")
    assert '["temperature", "temperature", "mdi:thermometer"]' in source
    assert 'key: "temperature_c"' in source
    assert 'required: true' in source


def test_quick_log_supports_temperature_value() -> None:
    source = QUICK_LOG.read_text(encoding="utf-8")
    assert "const PRESETS = RECORD_TYPES.flatMap" in source
    assert 'preset.recordType === "temperature"' in source
    assert "normalizedData.temperature_c = temperature" in source
    assert 'field.key === "temperature_c" ? "quick-temperature"' in source
    assert 'type: "puppy_tracker/mother/record/add"' in source


def test_bulk_log_adds_temperature_type() -> None:
    source = SCHEMA.read_text(encoding="utf-8")
    bulk = (FRONTEND / "puppy-tracker-bulk-dossier-card.js").read_text(encoding="utf-8")
    assert '["temperature", "temperature", "mdi:thermometer"]' in source
    assert "RECORD_TYPES," in bulk


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
