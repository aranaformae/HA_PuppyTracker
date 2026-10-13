"""Keep translation keys and runtime placeholders aligned with the source."""

import json
from pathlib import Path
from string import Formatter

import pytest
from homeassistant.helpers.translation import async_get_translations

INTEGRATION = Path(__file__).resolve().parents[1] / "custom_components" / "puppy_tracker"


def _leaves(value, prefix=""):
    result = {}
    for key, item in value.items():
        path = f"{prefix}{key}"
        if isinstance(item, dict):
            result.update(_leaves(item, f"{path}."))
        else:
            result[path] = item
    return result


@pytest.mark.parametrize("language", ["nl", "en"])
def test_translations_cover_all_source_keys_and_keep_placeholders(language):
    source = _leaves(json.loads((INTEGRATION / "strings.json").read_text()))
    translated = _leaves(json.loads(
        (INTEGRATION / "translations" / f"{language}.json").read_text()
    ))
    assert translated.keys() == source.keys()
    formatter = Formatter()
    for key, value in source.items():
        assert translated[key], key
        expected = {field for _, field, _, _ in formatter.parse(value) if field}
        actual = {field for _, field, _, _ in formatter.parse(translated[key]) if field}
        assert actual == expected, key


def test_english_translation_matches_canonical_english_source():
    assert json.loads((INTEGRATION / "translations" / "en.json").read_text()) == (
        json.loads((INTEGRATION / "strings.json").read_text())
    )


@pytest.mark.parametrize("step", ["create_litter", "edit_litter"])
async def test_home_assistant_loads_dutch_parent_identity_labels(hass, step):
    translations = await async_get_translations(hass, "nl", "options", {"puppy_tracker"})
    prefix = f"component.puppy_tracker.options.step.{step}.data."
    assert translations[f"{prefix}father_chip_number"] == "Chipnummer vader"
    assert translations[f"{prefix}mother_chip_number"] == "Chipnummer moeder"
    assert translations[f"{prefix}father_registered_name"] == "Naam vader"
    assert translations[f"{prefix}mother_registered_name"] == "Naam moeder"
