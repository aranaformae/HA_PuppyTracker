from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend"


def test_care_program_card_is_registered() -> None:
    frontend = (ROOT / "custom_components" / "puppy_tracker" / "frontend.py").read_text(encoding="utf-8")
    assert '"puppy-tracker-care-program-card.js"' in frontend


def test_care_program_card_uses_age_based_api_contract() -> None:
    source = (FRONTEND / "puppy-tracker-care-program-card.js").read_text(encoding="utf-8")

    assert 'type: "puppy_tracker/care_programs"' in source
    assert 'type: "puppy_tracker/care_program/create"' in source
    assert 'type: "puppy_tracker/care_program/update"' in source
    assert 'type: "puppy_tracker/care_program/delete"' in source
    assert 'schedule_type: root.getElementById("care-schedule-type")' in source
    assert 'start_age_days:' in source
    assert 'end_age_days:' in source
    assert 'interval_days:' in source
    assert 'time_of_day:' in source


def test_care_program_card_exposes_structured_result_configuration() -> None:
    source = (FRONTEND / "puppy-tracker-care-program-card.js").read_text(encoding="utf-8")

    assert '"result", "score", "note"' in source
    assert 'notifications_enabled:' in source
    assert 'notification_lead_minutes:' in source
    assert 'care-lead-minutes' in source
    assert 'care-result-result' in source
    assert 'care-result-score' in source
    assert 'care-result-note' in source

    api = (ROOT / "custom_components" / "puppy_tracker" / "care_program_api.py").read_text(encoding="utf-8")
    assert api.count('vol.Optional("notification_lead_minutes")') == 2


def test_care_program_mutations_are_hidden_for_non_admin_users() -> None:
    source = (FRONTEND / "puppy-tracker-care-program-card.js").read_text(encoding="utf-8")

    assert 'const isAdmin = Boolean(this._hass?.user?.is_admin)' in source
    assert 'this._showEditor && isAdmin' in source
    assert 'isAdmin ? `<button id="add-program"' in source


def test_care_program_card_exposes_filtering_and_overflow_controls() -> None:
    source = (FRONTEND / "puppy-tracker-care-program-card.js").read_text(encoding="utf-8")

    assert '{ name: "max_items"' in source
    assert '{ name: "compact"' in source
    assert '{ name: "sort_order"' in source
    assert 'id="program-search"' in source
    assert "schedulesOverlap" in source
    assert "max-height:60vh" in source
