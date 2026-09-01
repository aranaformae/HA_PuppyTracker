from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_care_program_store_is_loaded_into_runtime_before_api_registration() -> None:
    init_source = (ROOT / "custom_components" / "puppy_tracker" / "__init__.py").read_text(encoding="utf-8")
    runtime_source = (ROOT / "custom_components" / "puppy_tracker" / "runtime.py").read_text(encoding="utf-8")

    assert "care_programs: AgeBasedCareProgramStore | None = None" in runtime_source
    assert "care_programs = AgeBasedCareProgramStore(hass)" in init_source
    assert "await care_programs.async_load()" in init_source
    assert "care_programs=care_programs" in init_source
    assert init_source.index("await care_programs.async_load()") < init_source.index("async_setup_care_program_api(hass)")


def test_care_program_api_exposes_program_crud_occurrences_and_result_recording() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "care_program_api.py").read_text(encoding="utf-8")

    assert 'f"{DOMAIN}/care_programs"' in source
    assert 'f"{DOMAIN}/care_occurrences"' in source
    assert 'f"{DOMAIN}/care_occurrence/record"' in source
    assert 'f"{DOMAIN}/care_program/create"' in source
    assert 'f"{DOMAIN}/care_program/update"' in source
    assert 'f"{DOMAIN}/care_program/delete"' in source
    assert "derive_litter_care_occurrences" in source
    assert "async_record_care_result" in source


def test_only_care_program_management_requires_admin() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "care_program_api.py").read_text(encoding="utf-8")

    assert source.count("@websocket_api.require_admin") == 3
    record_pos = source.index('f"{DOMAIN}/care_occurrence/record"')
    first_admin_pos = source.index("@websocket_api.require_admin")
    assert record_pos < first_admin_pos


def test_care_result_api_rederives_occurrence_and_rejects_duplicates() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "care_program_api.py").read_text(encoding="utf-8")

    assert "def _derive_occurrence(" in source
    assert "derive_litter_care_occurrences(program, [puppy])" in source
    assert "def _existing_occurrence_result(" in source
    assert 'data.get("care_occurrence_id")' in source
    assert "already has an active result" in source
    assert "occurred_at=msg.get(\"occurred_at\")" in source


def test_occurrence_api_reports_missing_birth_times_without_guessing() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "care_program_api.py").read_text(encoding="utf-8")

    assert '"skipped": skipped' in source
    assert '"puppy_name":' in source
    assert '"reason_code": _skip_reason_code(reason)' in source
    assert 'return "missing_birth_time"' in source
    assert '"reason": reason' in source
    assert "except ValueError as err" in source


def test_care_program_api_preserves_existing_owner_and_reminder_contracts() -> None:
    source = (ROOT / "custom_components" / "puppy_tracker" / "care_program_api.py").read_text(encoding="utf-8")

    assert "owner_scope" not in source
    assert "last_completed_at" not in source
    assert "async_match_record" not in source
    assert "recurring_reminders" not in source
