from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOTHER_API = ROOT / "custom_components" / "puppy_tracker" / "mother_dashboard_api.py"
MOTHER_SURFACES = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-mother-surfaces.js"
FRONTEND = ROOT / "custom_components" / "puppy_tracker" / "frontend.py"


def test_mother_dashboard_api_exposes_attention_and_export_url() -> None:
    source = MOTHER_API.read_text(encoding="utf-8")

    assert 'f"{DOMAIN}/mother/attention"' in source
    assert 'dossier_action_summary(context.get("records", []))' in source
    assert 'f"{DOMAIN}/mother/export_url"' in source
    assert 'await async_signed_mother_export_path(' in source
    assert 'history_scope' in source


def test_frontend_registers_mother_dashboard_api() -> None:
    source = FRONTEND.read_text(encoding="utf-8")

    assert "from .mother_dashboard_api import async_setup_mother_dashboard_api" in source
    assert "async_setup_mother_dashboard_api(hass)" in source
    assert '"puppy-tracker-mother-surfaces.js"' in source


def test_attention_card_includes_mother_dossier_actions() -> None:
    source = MOTHER_SURFACES.read_text(encoding="utf-8")

    assert 'const ATTENTION_TAG = "puppy-tracker-attention-card"' in source
    assert 'type: "puppy_tracker/mother/attention"' in source
    assert 'this.__motherAttention?.dossier_actions?.actions || []' in source
    assert 'className = `row mother-action' in source


def test_report_card_can_export_full_or_current_mother_history() -> None:
    source = MOTHER_SURFACES.read_text(encoding="utf-8")

    assert 'const REPORT_TAG = "puppy-tracker-report-card"' in source
    assert 'type: "puppy_tracker/mother/export_url"' in source
    assert 'this.__motherExportScope || "all"' in source
    assert 'value="current"' in source
    assert 'copy(this, "Moeder JSON", "Mother JSON")' in source
