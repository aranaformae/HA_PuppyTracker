"""Data-management wiring tests for coordinated backup restore."""

from pathlib import Path


def test_options_flow_uses_coordinated_restore_transaction() -> None:
    source = Path(
        "custom_components/puppy_tracker/data_management_flow.py"
    ).read_text(encoding="utf-8")

    assert "from .backup_transaction import async_apply_import_transaction" in source
    assert "await async_apply_import_transaction(" in source
    assert "care_reminders=runtime.care_reminders" in source
    assert "care_programs=runtime.care_programs" in source
    assert "recurring_reminders=runtime.recurring_reminders" in source

    # External stores must no longer be written as a second uncoordinated step
    # after the main storage import has already committed.
    assert "await runtime.care_reminders.async_restore_backup_settings(" not in source
    assert "    async_apply_import,\n" not in source
