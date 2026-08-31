from pathlib import Path

from custom_components.puppy_tracker.frontend import CARD_FILES


PROFILE_NOTE_MODULE = "puppy-tracker-litter-profile-note.js"
LITTER_CARD_MODULE = "puppy-tracker-litter-card.js"


def _source() -> str:
    return (
        Path(__file__).parents[1]
        / "custom_components"
        / "puppy_tracker"
        / "frontend"
        / PROFILE_NOTE_MODULE
    ).read_text(encoding="utf-8")


def test_profile_note_module_loads_after_litter_card() -> None:
    """The enhancement must patch the litter card only after it is registered."""
    assert PROFILE_NOTE_MODULE in CARD_FILES
    assert CARD_FILES.index(PROFILE_NOTE_MODULE) == CARD_FILES.index(LITTER_CARD_MODULE) + 1


def test_profile_note_module_uses_existing_payload_and_safe_text() -> None:
    """Profile notes are rendered from litter data without injecting HTML."""
    source = _source()

    assert "card._data.puppies" in source
    assert "puppy?.profile_note" in source
    assert "text.textContent = note" in source
    assert 'block.className = "profile-note"' in source


def test_litter_display_shows_richer_growth_context() -> None:
    """The litter view combines grams, percentages, trend and timing context."""
    source = _source()

    assert "growth_24h_grams" in source
    assert "growth_24h_percent" in source
    assert "growth_birth_percent" in source
    assert "trendArrow(puppy)" in source
    assert "sparkline(puppy)" in source
    assert 'small.textContent = localDateTime(s.last_weighed)' in source
    assert "statusExplanation(puppy)" in source
    assert 'small.textContent = `${grams(s.growth_24h_grams)} · gem. ${percent(avg.percentPerDay)}/dag`' in source


def test_litter_detail_shows_growth_range_without_duplicate_daily_average() -> None:
    """Expanded pup details keep useful range data without repeating daily growth."""
    source = _source()

    assert "function averageGrowth(puppy)" in source
    assert "gramsPerDay: totalGrams / ageDaysAtMeasurement" in source
    assert "percentPerDay: totalPercent / ageDaysAtMeasurement" in source
    assert 'statCell("Gem. groei / dag"' not in source
    assert 'statCell("Laagste gewicht"' in source
    assert 'statCell("Hoogste gewicht"' in source
    assert 'progressLabel.textContent = "Gewichtsontwikkeling sinds geboorte"' in source


def test_first_measurement_avoids_false_growth_precision() -> None:
    """A single weighing must not look like a real comparison or growth range."""
    source = _source()

    assert "const hasComparison = measurements.length >= 2" in source
    assert 'main.textContent = "—"' in source
    assert 'small.textContent = "Nog geen vergelijkingsbasis"' in source
    assert 'setDetailValue(detail, "Vorige meting", "—")' in source
    assert "if (hasComparison) {" in source
    assert ': "Nog geen ontwikkeling beschikbaar"' in source


def test_first_day_uses_birth_and_previous_change_instead_of_extrapolated_24h_growth() -> None:
    """The first 24 hours should not present an extrapolated daily rate as observed growth."""
    source = _source()

    assert 'return ["first_24h", "first_day_excess_weight_loss"].includes' in source
    assert 'if (firstDay) {' in source
    assert 'main.textContent = percent(s.growth_birth_percent)' in source
    assert 'small.textContent = `${grams(totalGrowthGrams)} · sinds geboorte`' in source
    assert 'statCell("Sinds geboorte", `${grams(totalGrowthGrams)} · ${percent(totalGrowthPercent)}`)' in source
    assert 'statCell("Sinds vorige meting", `${grams(s.change_grams)} · ${percent(previousGrowthPercent)}`)' in source
    assert '} else if (hasComparison) {' in source
    assert 'statCell("24u groei", `${grams(s.growth_24h_grams)} · ${percent(s.growth_24h_percent)}`)' in source
