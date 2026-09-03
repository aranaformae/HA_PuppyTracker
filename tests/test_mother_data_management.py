from pathlib import Path


ROOT = Path(__file__).parents[1] / "custom_components" / "puppy_tracker"


def _source(name: str) -> str:
    return (ROOT / name).read_text(encoding="utf-8")


def test_options_flow_layers_mother_data_management_before_existing_flow() -> None:
    source = _source("config_flow.py")
    assert "from .mother_data_management import MotherDataManagementMixin" in source
    assert "MotherDataManagementMixin," in source
    assert "PuppyTrackerDataManagementMixin," in source


def test_mother_export_supports_all_or_one_litter_context() -> None:
    source = _source("mother_data_management.py")
    assert 'options=["full", "litter", "puppy", "mother"]' in source
    assert 'value="__all__"' in source
    assert "async_signed_mother_export_path" in source
    assert "litter_id=litter_id" in source


def test_mother_import_defaults_to_safe_plan_and_explicit_litter_mapping() -> None:
    source = _source("mother_data_management.py")
    assert "mother_import_options" in source
    assert "plan_mother_import" in source
    assert "async_step_import_mother_litters" in source
    assert "_mother_litter_field_key" in source
    assert "mapping[source_id] = str(user_input[field_keys[source_id]])" in source
    assert "async_apply_mother_import" in source


def test_mother_download_endpoint_is_signed_and_authenticated() -> None:
    source = _source("mother_backup_http.py")
    assert "requires_auth = True" in source
    assert "async_sign_path" in source
    assert 'request.query.get("litter_id")' in source
