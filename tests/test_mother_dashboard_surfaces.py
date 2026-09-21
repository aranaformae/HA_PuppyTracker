from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOTHER_API = ROOT / "custom_components" / "puppy_tracker" / "mother_dashboard_api.py"
MOTHER_SURFACES = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-mother-surfaces.js"
ATTENTION_CARD = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-attention-card.js"
REPORT_CARD = ROOT / "custom_components" / "puppy_tracker" / "frontend" / "puppy-tracker-report-card.js"
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
    assert '"puppy-tracker-mother-surfaces.js"' not in source
    assert 'from "./puppy-tracker-mother-surfaces.js";' in ATTENTION_CARD.read_text(encoding="utf-8")


def test_attention_card_includes_mother_dossier_actions() -> None:
    source = MOTHER_SURFACES.read_text(encoding="utf-8")

    assert "export async function loadMotherAttention(card)" in source
    assert "export function renderMotherAttention(card)" in source
    assert "registerCardHooks" not in source
    assert "__puppyTrackerMotherAttentionPatched" not in source
    assert 'type: "puppy_tracker/mother/attention"' in source
    assert 'card.__motherAttention?.dossier_actions?.actions || []' in source
    assert 'className = `row mother-action' in source


def test_report_card_can_export_full_or_current_mother_history() -> None:
    source = REPORT_CARD.read_text(encoding="utf-8")

    assert 'const MOTHER_VALUE = "__mother__"' in source
    assert 'type: "puppy_tracker/mother/export_url"' in source
    assert "history_scope: this._motherExportScope" in source
    assert 'anchor.download = "puppy-tracker-mother.json"' in source
    assert 'value="current"' in source
    assert 'motherJson: "Moeder JSON"' in source
    assert "__puppyTrackerMotherReportPatched" not in source
